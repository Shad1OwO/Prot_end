import { classBatchSize, classifyClassesQuery, mapCategories, parseClassRoots } from "./categories";
import { imageInfoBatchSize, imageInfoUrl, parseImageInfo } from "./commons";
import { capitalise, clip, distanceKm, enHash, firstSentence, slugFor, trimIntro } from "./text";
import { translationBatchSize, type TextField, type TranslationRequest, type Translator } from "./translate";
import type { CategorySlug, FetchJson, ImportPlace, Photo, PlaceText, RawPlace, ThaiSource } from "./types";
import { buildDetailsQuery, buildIdsQuery, classClauses, detailsBatchSize, parsePlaces, sparqlEndpoint, type SparqlJson } from "./wikidata";
import { articleUrl, extractsBatchSize, extractsUrl, parseExtracts } from "./wikipedia";

export interface CachedThai { enHash: string; thSource: ThaiSource; th: PlaceText }
export interface CuratedPoint { latitude: number; longitude: number; wikidataIds?: string[] }

export interface BuildDeps {
  fetchJson: FetchJson;
  translator: Translator;
  minSitelinks: number;
  limit?: number;
  /** Thai text already stored for each Wikidata id, so unchanged places are not translated again. */
  cachedThai: Map<string, CachedThai>;
  /** Curated destinations: their own Wikidata items, and places right next to them, are duplicates of them. */
  curatedPoints: CuratedPoint[];
  log?: (line: string) => void;
}

export interface BuildResult {
  places: ImportPlace[];
  fetched: number;
  dropped: Record<"noText" | "noPhoto" | "nearCurated", number>;
  /** False when any request failed: the caller must not archive anything based on this run. */
  complete: boolean;
  error?: string;
}

/** Only a place this close to a curated one, or its own Wikidata item, is a duplicate: Wat Pho is 1.8 km from Yaowarat. */
export const curatedRadiusKm = 0.3;
const maxTranslationFailures = 2;
const textFields: TextField[] = ["name", "shortDescription", "description"];

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function sparql(fetchJson: FetchJson, query: string): Promise<SparqlJson> {
  return await fetchJson(sparqlEndpoint, { method: "POST", headers: { accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString() }) as SparqlJson;
}

async function extracts(fetchJson: FetchJson, lang: "en" | "th", titles: string[]): Promise<Map<string, string>> {
  const all = new Map<string, string>();
  for (const batch of chunks([...new Set(titles)], extractsBatchSize)) {
    for (const [title, text] of parseExtracts(await fetchJson(extractsUrl(lang, batch)))) all.set(title, text);
  }
  return all;
}

function englishText(place: RawPlace, intro: string | undefined): PlaceText | null {
  const wikidataDescription = place.descriptionEn ? capitalise(place.descriptionEn.trim()) : "";
  // Wikidata descriptions are short fragments, not sentences ("U.S. national park in Utah"), so they are only clipped.
  const shortDescription = wikidataDescription ? clip(wikidataDescription, 160) : intro ? firstSentence(intro) : "";
  const description = intro ? trimIntro(intro) : wikidataDescription;
  return shortDescription && description ? { name: place.labelEn, shortDescription, description } : null;
}

/** Fetches, merges and translates places. Pure apart from the injected fetch and translator. */
export async function buildImportPlaces(deps: BuildDeps): Promise<BuildResult> {
  const log = deps.log ?? (() => {});
  const dropped = { noText: 0, noPhoto: 0, nearCurated: 0 };
  try {
    const idResults: SparqlJson[] = [];
    for (const [kind, clause] of Object.entries(classClauses)) {
      log(`wikidata: listing ${kind}`);
      idResults.push(await sparql(deps.fetchJson, buildIdsQuery(clause, deps.minSitelinks)));
    }
    const notability = new Map<string, number>();
    for (const result of idResults) {
      for (const row of result.results.bindings) {
        const qid = row.item?.value.split("/").pop();
        if (qid) notability.set(qid, Math.max(notability.get(qid) ?? 0, Number(row.links?.value) || 0));
      }
    }
    let qids = [...notability.keys()].sort((left, right) => (notability.get(right) ?? 0) - (notability.get(left) ?? 0) || left.localeCompare(right));
    // A trial run only needs details for the best-known places; twice the limit leaves room for ones dropped below.
    if (deps.limit !== undefined) qids = qids.slice(0, deps.limit * 2);
    const detailResults: SparqlJson[] = [];
    for (const [index, batch] of chunks(qids, detailsBatchSize).entries()) {
      log(`wikidata: details ${index * detailsBatchSize + batch.length}/${qids.length}`);
      detailResults.push(await sparql(deps.fetchJson, buildDetailsQuery(batch)));
    }
    const all = parsePlaces([...idResults, ...detailResults]).sort((left, right) => right.sitelinks - left.sitelinks || left.qid.localeCompare(right.qid));
    const fetched = all.length;
    let candidates = all.filter((place) => {
      const near = deps.curatedPoints.some((point) => point.wikidataIds?.includes(place.qid) || distanceKm(point, place) <= curatedRadiusKm);
      if (near) dropped.nearCurated += 1;
      return !near;
    });
    if (deps.limit !== undefined) candidates = candidates.slice(0, deps.limit);
    log(`wikidata: ${fetched} places, ${candidates.length} to import`);

    const classRoots = new Map<string, CategorySlug[]>();
    for (const batch of chunks([...new Set(candidates.flatMap((place) => place.classIds))], classBatchSize)) {
      for (const [classId, slugs] of parseClassRoots(await sparql(deps.fetchJson, classifyClassesQuery(batch)))) classRoots.set(classId, slugs);
    }

    log("wikipedia: fetching intros");
    const enIntros = await extracts(deps.fetchJson, "en", candidates.flatMap((place) => (place.enwikiTitle ? [place.enwikiTitle] : [])));
    const thIntros = await extracts(deps.fetchJson, "th", candidates.flatMap((place) => (place.thwikiTitle ? [place.thwikiTitle] : [])));

    log("commons: fetching photo credits");
    const photos = new Map<string, Photo>();
    for (const batch of chunks([...new Set(candidates.map((place) => place.imageFile))], imageInfoBatchSize)) {
      for (const [title, photo] of parseImageInfo(await deps.fetchJson(imageInfoUrl(batch)))) photos.set(title, photo);
    }

    const drafts: Array<Omit<ImportPlace, "th" | "thSource"> & { thKnown: Partial<PlaceText>; need: TextField[]; cached?: CachedThai }> = [];
    for (const place of candidates) {
      const en = englishText(place, place.enwikiTitle ? enIntros.get(place.enwikiTitle) : undefined);
      if (!en) { dropped.noText += 1; continue; }
      const photo = photos.get(place.imageFile);
      if (!photo) { dropped.noPhoto += 1; continue; }
      const thIntro = place.thwikiTitle ? thIntros.get(place.thwikiTitle) : undefined;
      const thKnown: Partial<PlaceText> = { ...(place.labelTh ? { name: place.labelTh } : {}), ...(thIntro ? { shortDescription: firstSentence(thIntro), description: trimIntro(thIntro) } : {}) };
      const hash = enHash(en);
      const cached = deps.cachedThai.get(place.qid);
      drafts.push({
        raw: place, slug: slugFor(place.labelEn, place.qid), categorySlugs: mapCategories(place, classRoots), photo, en, enHash: hash,
        wikipediaUrlEn: place.enwikiTitle && enIntros.has(place.enwikiTitle) ? articleUrl("en", place.enwikiTitle) : null,
        wikipediaUrlTh: place.thwikiTitle && thIntro ? articleUrl("th", place.thwikiTitle) : null,
        thKnown, need: textFields.filter((field) => !thKnown[field]),
        ...(cached && cached.enHash === hash && cached.thSource !== "english" ? { cached } : {}),
      });
    }

    const toTranslate: TranslationRequest[] = drafts.filter((draft) => draft.need.length > 0 && !draft.cached).map((draft) => ({ qid: draft.raw.qid, en: draft.en, need: draft.need }));
    const translations = new Map<string, Partial<PlaceText>>();
    if (toTranslate.length > 0) log(`translate: ${toTranslate.length} places`);
    // A translator that keeps failing (an outage, a used-up daily quota) must not stretch the run by hours:
    // after two empty batches in a row the rest get English now and are retried on the next run.
    let failuresInARow = 0;
    for (const [index, batch] of chunks(toTranslate, translationBatchSize).entries()) {
      if (failuresInARow >= maxTranslationFailures) {
        log(`translate: giving up after ${maxTranslationFailures} failed batches; ${toTranslate.length - index * translationBatchSize} places keep English until the next run`);
        break;
      }
      try {
        const answer = await deps.translator.translate(batch);
        for (const [qid, text] of answer) translations.set(qid, text);
        failuresInARow = answer.size > 0 ? 0 : failuresInARow + 1;
      } catch (error) {
        failuresInARow += 1;
        log(`translate: batch failed, using English (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    const places: ImportPlace[] = drafts.map(({ thKnown, need, cached, ...draft }) => {
      if (need.length === 0) return { ...draft, th: thKnown as PlaceText, thSource: "wikipedia" };
      if (cached) return { ...draft, th: { ...cached.th, ...thKnown }, thSource: cached.thSource };
      const translated = translations.get(draft.raw.qid);
      if (translated && need.every((field) => translated[field])) return { ...draft, th: { ...draft.en, ...translated, ...thKnown }, thSource: "machine" };
      return { ...draft, th: { ...draft.en, ...thKnown }, thSource: "english" };
    });
    return { places, fetched, dropped, complete: true };
  } catch (error) {
    return { places: [], fetched: 0, dropped, complete: false, error: error instanceof Error ? error.message : String(error) };
  }
}
