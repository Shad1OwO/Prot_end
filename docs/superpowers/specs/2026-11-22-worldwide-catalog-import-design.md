# Worldwide catalog import from Wikidata — design

Date: 2026-11-22

## Intent

Explore only lists the 8 seed destinations. The catalog should hold a broad, real, worldwide set of places so that
Explore and AI search (which shortlists catalog destinations, then has an AI rank them) have real coverage. The data
comes from a public source through a repeatable import, not hand-written seed entries.

## Goals

- A repeatable, idempotent command that loads roughly 3,900 notable places worldwide (Thailand included) with `en` and
  `th` text, coordinates, a category, a real country and a credited photo.
- Re-running it updates what changed, adds new places, archives places it imported earlier that have left the source,
  and does not pay to re-translate text that has not changed.
- Explore lists the places with paging and the existing filters (scope, category, country, query, distance) working.
- Photographers and Wikipedia are credited as the licences require.

## Non-goals

- No scheduled or worker-driven import. Re-running by hand every few months is enough.
- No copying photos into our own object storage (photos are loaded from Wikimedia, see below).
- No province or city data for imported places (Wikidata's admin hierarchy is too inconsistent). The card shows the country.
- No change to the existing `POST /api/v1/internal/catalog/imports` endpoint (it maps every worldwide item to a fake
  `ZZ` country; that is a separate follow-up).
- No admin UI for correcting machine translations.

## Anti-goals

- Hand-edited seed or curated destinations must never be modified, archived or duplicated by the import.
- No photo without its author and licence shown. No Wikipedia text without a source link.
- An outage of Gemini (or a missing key) must never block or fail the import.

## Decisions (made with the user)

1. **Source: Wikidata + Wikipedia + Wikimedia Commons.** No API keys. Wikidata facts are CC0, Wikipedia text is
   CC BY-SA, and each Commons photo has its own free licence.
2. **Thai text:** use Thai Wikidata labels and Thai Wikipedia intros where they exist (about 17% of places). For the
   rest, machine-translate the English with Gemini (`GEMINI_API_KEY`, already in `.env`). If Gemini is unavailable or
   fails for a place, put the English text in the Thai fields.
3. **Images:** link to 1600px Commons thumbnails on `upload.wikimedia.org`. Credit the photographer (author, licence,
   licence link, Commons file page). The user agreed to show the credit.
4. **How it runs and how big (Claude's call, not objected to):** a CLI command in `packages/db`, run by hand on the
   server like migrations. Notability cut-off: items with at least 10 Wikipedia sitelinks (configurable).

## Approaches considered

- **Source.** Wikidata/Wikipedia (picked): free, no key, coordinates, ISO countries, types, photos and some Thai in one
  place. Geoapify Places: free key with a 3,000/day cap, ODbL, but no descriptions, photos or Thai names, so it would
  need Wikipedia anyway. OpenTripMap: built on the same OSM/Wikidata data, but the project appears unmaintained.
- **Thai text.** Gemini with English fallback (picked). English only: free, but most worldwide places would show
  English to Thai visitors. Only places with Thai on Wikipedia: all human-written, but only about 650 places.
- **Images.** Link to Commons thumbnails (picked): little work, no storage, but a photo breaks if Commons
  renames or deletes the file before the next run. Mirroring through the worker's scan → WebP → S3 pipeline: no
  dependency on Commons, but about 3,900 downloads and scans, 1–2 GB of storage and a much longer import.
- **Write path.** Write directly to Postgres from a `packages/db` script, like `seed.ts` (picked), rather than through
  the internal HTTP endpoint. The endpoint cannot carry country, credits or source ids, and it caps at 500 items per call.

## Measured coverage (Wikidata, 2026-11-22)

Union of: instances of tourist attraction (Q570116) and its subclasses, World Heritage Sites (P1435 = Q9259) and
national parks (Q46169), with coordinates.

| Sitelinks | Places | With photo | With Thai label |
|---|---|---|---|
| ≥ 10 | 3,935 | 98% | 651 |
| ≥ 20 | 2,143 | 99% | 569 |

## Design

### Pipeline

`packages/db/src/catalog-import/` (pure modules plus one runner script):

1. **Fetch places (Wikidata SPARQL, `query.wikidata.org`).** One query per class in the union above, so no single
   query nears the 60 s timeout. Fetch: Q-id, en/th labels, en description, coordinates (P625), country (P17) with
   its ISO 3166-1 alpha-2 code (P297) and en/th labels, instance-of (P31) Q-ids, image (P18), en/th Wikipedia article
   titles, and sitelink count. Merge on Q-id. Drop items with no country ISO code, no coordinates or no image. An
   item with several countries (borders) takes the first ISO code in a stable order (sorted).
2. **Fetch text (Wikipedia action API).** `action=query&prop=extracts&exintro&explaintext`, 20 titles per request,
   for en and for th titles. `description` = the intro trimmed to about 600 characters at a sentence boundary.
   `shortDescription` = the Wikidata en description, capitalised, else the first sentence of the intro (≤ 160 characters).
   An item with no en intro and no en description is dropped.
3. **Fetch photo metadata (Commons API).** `action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`,
   50 files per request. Keep the thumb URL and width/height, plus `Artist` (strip HTML to plain text),
   `LicenseShortName`, `LicenseUrl` and the file description page URL. Drop the item if there is no thumb URL or no
   licence. Thumb URLs must be on `upload.wikimedia.org` over HTTPS.
4. **Thai text.** Per item: `th.name` = Thai label if present. `th.description` and `th.shortDescription` come from the
   Thai Wikipedia intro if present (short = first sentence). Any Thai field still missing is filled by a Gemini
   translation of the English, in batches of about 20 items per request, returning JSON keyed by Q-id
   (validated with Zod). If Gemini is not configured, errors, or returns an invalid result for an item, copy the
   English text for that item. Record the source of the Thai text per item: `wikipedia` | `machine` | `english`.
5. **Upsert (one transaction per batch of about 200 items).** Details below.
6. **Archive.** Imported destinations (`source = 'wikidata'`) whose Q-id was not in this run get `archived_at = now()`.
   This step only runs if the fetch steps completed without errors, so a half-failed run never archives the catalog.

Requests use a descriptive `User-Agent` (Wikimedia policy), set by the env var `CATALOG_IMPORT_USER_AGENT` with a
generic default, run one at a time with a small delay, retry 429/5xx with backoff, and honour `Retry-After`.

### Translation cache

Each imported destination stores `metadata.enHash` (sha256 of the en name + short + description) and
`metadata.thSource`. On a re-run, if an item's `enHash` is unchanged and its stored `thSource` is `machine` or
`wikipedia`, the stored Thai text is reused and Gemini is not called. Items whose stored Thai is `english` are retried
with Gemini on the next run, so a run made without a key gets upgraded later.

### Schema changes (one new migration, 0004)

- `destinations.source text` (nullable; `'wikidata'` for imported rows) and `destinations.external_id text`
  (nullable; the Q-id), with a unique index on `(source, external_id)`. Upsert by this key instead of by slug.
- `destinations.notability integer not null default 0`, set to the sitelink count, so Explore's default order puts the
  Eiffel Tower ahead of obscure places.
- `media_assets`: nullable `author`, `license`, `license_url`, `attribution_url` (the Commons file page).
- Check the generated SQL by hand: no quoted parameterised types (a test in `tests/contracts.test.ts` enforces this).

### Upsert details

- **Countries:** upsert by ISO code (`scope = thailand` for `TH`, else `worldwide`). Upsert en and th names from
  Wikidata labels (th falls back to en). Existing seed countries keep their translations; the import only inserts
  missing translations.
- **Destinations:** slug = slugified en name plus `-q<id>` (for example `eiffel-tower-q243`), set on insert and never
  changed afterwards, so links stay stable. `scope` = `thailand` if the country is TH, else `worldwide`. `address` =
  the country's en name. `metadata` = `{ source: "wikidata", wikidataId, wikipediaUrlEn, wikipediaUrlTh?, enHash, thSource }`.
  `archived_at` is cleared on update.
- **Never touch curated rows:** the upsert key is `(source, external_id)`, so seed rows (source null) cannot match.
  Slug collisions are impossible because of the `-q<id>` suffix. **Duplicates of curated places:** skip the Wikidata
  items each seed destination lists in `wikidataIds` (seed Doi Inthanon versus Wikidata Doi Inthanon National Park),
  and any item within 300 m of a non-imported destination. (Changed from a 2 km radius after review: 2 km around
  Yaowarat Road dropped Wat Pho and Wat Traimit.)
- **Translations:** upsert en and th rows.
- **Categories:** replace this destination's category links with a mapping from P31 Q-ids to the existing six slugs
  (beaches, culture, nature, food, adventure, city): beach → beaches; museum, temple, church, castle, palace,
  monument, archaeological site, World Heritage cultural → culture; national park, mountain, lake, waterfall,
  island, nature reserve → nature; square, street, tower, bridge, district → city; volcano, cave, canyon, glacier →
  adventure. Unmapped items get `culture` if they are a World Heritage Site, else `nature` if they are a national park,
  else `city`. Each item gets at least one category. The mapping is a plain table in code and covered by unit tests.
- **Images:** one primary image per destination. `media_assets` is upserted by `sha256(sourceUrl)` with width, height
  and the credit fields. The destination's image rows are replaced.
- **Metrics:** insert `destination_metrics` with defaults if missing, and never overwrite real likes or ratings.

### API, contracts and web

- `destinationImageSchema` gains an optional `attribution: { author, license, licenseUrl, sourceUrl }`.
  `PostgresRepository` fills it from `media_assets`.
- `allowedImageHosts` and `next.config.ts` `imageHosts` gain `upload.wikimedia.org`. The CSP `img-src` follows
  automatically, because it is built from the same list. `tests/web-config.test.ts` keeps them equal.
- The detail page shows a credit line over the hero photo: "Photo: {author} · {license}", linking to the Commons page
  and the licence. It also shows a "Text: Wikipedia" link under "About" when `metadata.wikipediaUrl*` is set (the
  page's locale first). Cards show the credit as the image's `title` tooltip.
- Explore's default ("featured") sort becomes featured → likes → notability → id. The other sorts gain notability as
  the last tie-break before id.
- Cards and the detail page hide the star rating when the rating is 0, instead of showing "0.0". All imported places
  start at 0.
- `MemoryRepository` needs no data changes. Only the type changes (the optional field).

### Command

- `bun run catalog:import` in `packages/db` (script `src/catalog-import/run.ts`). Flags: `--min-sitelinks=10`,
  `--limit=N` (for trial runs), `--dry-run` (fetch and report counts, write nothing), `--no-translate`.
- It prints a summary: fetched, dropped (by reason), inserted, updated, archived, and the Thai source counts.
- On the server: rebuild the api image, run the migration, then
  `docker compose run --rm -w /workspace/packages/db api bun run catalog:import`. It needs `DATABASE_URL` (already
  in the api env) and optionally `GEMINI_API_KEY`. Documented in `deploy.md`.

### Testing

- Unit tests (no network) for: category mapping, intro trimming and first sentence, slugging, Commons extmetadata
  parsing (HTML author stripped), Gemini response validation and English fallback, translation-cache reuse,
  choosing the country among several, and dropping items with missing pieces. Use fixture JSON shaped like the real
  API responses.
- The contracts test continues to check the migration SQL. Web-config tests cover the new host.
- A manual check against a local Postgres/PostGIS with `--limit=50`: Explore with Worldwide scope pages through the
  results, and the country filter (for example `FR`), category filter and query search all return imported places.
- `bun run typecheck`, `bun run test`, and the web lint all pass.

## Left to the builder

- Exact SPARQL text and class lists, and whether the per-class queries need splitting further if they time out.
- The Gemini prompt wording and batch size, and the model (`gemini-2.5-flash`, the same one the worker uses).
- Exact delay and retry numbers.
- Where the credit line sits visually, within the existing styles.
