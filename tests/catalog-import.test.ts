import { describe, expect, test } from "bun:test";
import { categoryRoots, mapCategories, parseClassRoots } from "../packages/db/src/catalog-import/categories";
import { parseImageInfo } from "../packages/db/src/catalog-import/commons";
import { clip, distanceKm, enHash, firstSentence, slugFor, stripHtml, trimIntro } from "../packages/db/src/catalog-import/text";
import { seedDestinations } from "../packages/db/src/seed-data";
import { buildDetailsQuery, buildIdsQuery, classClauses, fileTitleFromCommonsUrl, parsePlaces, type SparqlJson } from "../packages/db/src/catalog-import/wikidata";
import { parseExtracts, titleFromArticleUrl } from "../packages/db/src/catalog-import/wikipedia";
import { createPoliteFetch, wikimediaDelayMs } from "../packages/db/src/catalog-import/http";
import { createGeminiTranslator, type Translator } from "../packages/db/src/catalog-import/translate";
import { buildImportPlaces } from "../packages/db/src/catalog-import/pipeline";
import type { FetchJson } from "../packages/db/src/catalog-import/types";
import { parseArgs } from "../packages/db/src/catalog-import/args";

describe("import command arguments", () => {
  test("reads every flag", () => {
    expect(parseArgs(["--min-sitelinks=20", "--limit=50", "--dry-run", "--no-translate"])).toEqual({ minSitelinks: 20, limit: 50, dryRun: true, translate: false });
  });
  test("defaults to the full run", () => {
    expect(parseArgs([])).toEqual({ minSitelinks: 10, dryRun: false, translate: true });
  });
  test("rejects values that are not positive whole numbers, and unknown flags", () => {
    expect(() => parseArgs(["--limit=abc"])).toThrow("--limit");
    expect(() => parseArgs(["--min-sitelinks=0"])).toThrow("--min-sitelinks");
    expect(() => parseArgs(["--force"])).toThrow("--force");
  });
});

const uri = (value: string) => ({ type: "uri", value });
const literal = (value: string, lang?: string) => ({ type: "literal", value, ...(lang ? { "xml:lang": lang } : {}) });
/** One row in the shape query.wikidata.org returns (copied from a real response for Q243). */
function row(overrides: Record<string, { type: string; value: string } | undefined> = {}) {
  const base: Record<string, { type: string; value: string } | undefined> = {
    item: uri("http://www.wikidata.org/entity/Q243"),
    labelEn: literal("Eiffel Tower", "en"),
    labelTh: literal("หอไอเฟล", "th"),
    descEn: literal("tower located on the Champ de Mars in Paris, France", "en"),
    coord: literal("Point(2.294479 48.858296)"),
    iso: literal("FR"),
    countryEn: literal("France", "en"),
    countryTh: literal("ประเทศฝรั่งเศส", "th"),
    class: uri("http://www.wikidata.org/entity/Q1440300"),
    image: uri("http://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel%20Wikimedia%20Commons.jpg"),
    enwiki: uri("https://en.wikipedia.org/wiki/Eiffel_Tower"),
    thwiki: uri("https://th.wikipedia.org/wiki/%E0%B8%AB%E0%B8%AD%E0%B9%84%E0%B8%AD%E0%B9%80%E0%B8%9F%E0%B8%A5"),
    links: literal("191"),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined)) as Record<string, { type: string; value: string }>;
}
const sparql = (...rows: Array<Record<string, { type: string; value: string }>>): SparqlJson => ({ head: { vars: [] }, results: { bindings: rows } });

describe("wikidata places", () => {
  test("several rows for one item become one place, chosen the same way every time", () => {
    const places = parsePlaces([
      sparql(row(), row({ class: uri("http://www.wikidata.org/entity/Q1440476"), iso: literal("AD"), countryEn: literal("Andorra", "en") }), row({ image: uri("http://commons.wikimedia.org/wiki/Special:FilePath/Another.jpg") })),
      sparql(row({ class: uri("http://www.wikidata.org/entity/Q2319498") })),
    ]);
    expect(places).toHaveLength(1);
    const place = places[0]!;
    expect(place.qid).toBe("Q243");
    expect(place.countryCode).toBe("AD");
    expect(place.countryNameEn).toBe("Andorra");
    expect(place.classIds).toEqual(["Q1440300", "Q1440476", "Q2319498"]);
    expect(place.imageFile).toBe("File:Another.jpg");
    expect(place.latitude).toBeCloseTo(48.858296);
    expect(place.longitude).toBeCloseTo(2.294479);
    expect(place.sitelinks).toBe(191);
    expect(place.enwikiTitle).toBe("Eiffel Tower");
    expect(place.thwikiTitle).toBe("หอไอเฟล");
    expect(place.labelTh).toBe("หอไอเฟล");
  });

  test("items without a country code, an earth coordinate, an image or an English label are left out", () => {
    const item = (id: string) => uri(`http://www.wikidata.org/entity/${id}`);
    const places = parsePlaces([sparql(
      row({ item: item("Q1"), iso: undefined }),
      row({ item: item("Q2"), coord: literal("<http://www.wikidata.org/entity/Q405> Point(1 2)") }),
      row({ item: item("Q3"), image: undefined }),
      row({ item: item("Q4"), labelEn: undefined }),
      row({ item: item("Q5") }),
    )]);
    expect(places.map((place) => place.qid)).toEqual(["Q5"]);
  });

  test("a P18 file URL becomes the title the Commons API uses", () => {
    expect(fileTitleFromCommonsUrl("http://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel_2.jpg")).toBe("File:Tour Eiffel 2.jpg");
  });

  test("place queries filter on notability and cover every class", () => {
    expect(Object.keys(classClauses).sort()).toEqual(["attraction", "heritage", "park"]);
    const query = buildIdsQuery(classClauses.heritage, 10);
    expect(query).toContain("wd:Q9259");
    expect(query).toContain("FILTER(?links >= 10)");
    expect(buildDetailsQuery(["Q1", "Q22", "bad id"])).toContain("VALUES ?item { wd:Q1 wd:Q22 }");
  });
});

describe("wikipedia intros", () => {
  test("titles are matched through normalisation and redirects", () => {
    const json = { query: { normalized: [{ from: "Eiffel_Tower", to: "Eiffel Tower" }], redirects: [{ from: "Tour Eiffel", to: "Eiffel Tower" }], pages: [{ title: "Eiffel Tower", extract: "The Eiffel Tower is a lattice tower." }, { title: "Missing page", missing: true }] } };
    const extracts = parseExtracts(json);
    expect(extracts.get("Eiffel_Tower")).toBe("The Eiffel Tower is a lattice tower.");
    expect(extracts.get("Tour Eiffel")).toBe("The Eiffel Tower is a lattice tower.");
    expect(extracts.get("Eiffel Tower")).toBe("The Eiffel Tower is a lattice tower.");
    expect(extracts.has("Missing page")).toBe(false);
  });
  test("article URLs give readable titles", () => {
    expect(titleFromArticleUrl("https://en.wikipedia.org/wiki/Eiffel_Tower")).toBe("Eiffel Tower");
  });
});

describe("commons photos", () => {
  // Shaped like a real imageinfo response (2026-11-22): thumbnails come from thumb.wikimedia.org with tracking parameters.
  const page = (title: string, extmetadata: Record<string, { value: string }>) => ({ title, imageinfo: [{ thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/1920px-Tour_Eiffel.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo", thumbwidth: 1600, thumbheight: 2961, descriptionurl: "https://commons.wikimedia.org/wiki/File:Tour_Eiffel.jpg", extmetadata }] });
  const json = { query: {
    normalized: [{ from: "File:Tour_Eiffel.jpg", to: "File:Tour Eiffel.jpg" }],
    pages: [
      page("File:Tour Eiffel.jpg", { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Benh">Benh LIEU SONG</a> &amp; friends' }, LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" } }),
      page("File:Credit only.jpg", { Credit: { value: "<span>Own work</span>" }, LicenseShortName: { value: "Public domain" } }),
      page("File:Anonymous.jpg", { LicenseShortName: { value: "Public domain" } }),
      page("File:No licence.jpg", { Artist: { value: "Someone" } }),
      { title: "File:Gone.jpg", missing: true },
    ],
  } };
  const photos = parseImageInfo(json);

  test("keeps the thumbnail without tracking parameters, its size and the credit", () => {
    const photo = photos.get("File:Tour Eiffel.jpg");
    expect(photo).toEqual({ url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/1920px-Tour_Eiffel.jpg", width: 1600, height: 2961, author: "Benh LIEU SONG & friends", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Tour_Eiffel.jpg" });
    expect(photos.get("File:Tour_Eiffel.jpg")).toEqual(photo as NonNullable<typeof photo>);
  });
  test("falls back to the credit line, then to Wikimedia Commons, for the author", () => {
    expect(photos.get("File:Credit only.jpg")?.author).toBe("Own work");
    expect(photos.get("File:Anonymous.jpg")?.author).toBe("Wikimedia Commons");
    expect(photos.get("File:Anonymous.jpg")?.licenseUrl).toBeNull();
  });
  test("a very long author credit is shortened, so the licence still fits beside it", () => {
    const long = parseImageInfo({ query: { pages: [page("File:Long.jpg", { Artist: { value: Array.from({ length: 40 }, (_, index) => `Contributor${index}`).join(", ") }, LicenseShortName: { value: "CC BY-SA 4.0" } })] } });
    const author = long.get("File:Long.jpg")?.author ?? "";
    expect(author.length).toBeLessThanOrEqual(100);
    expect(author.startsWith("Contributor0, Contributor1")).toBe(true);
    expect(author.endsWith("…")).toBe(true);
  });
  test("drops photos with no licence and missing files", () => {
    expect(photos.has("File:No licence.jpg")).toBe(false);
    expect(photos.has("File:Gone.jpg")).toBe(false);
  });
});

describe("categories", () => {
  const classRoots = parseClassRoots(sparql(
    { class: uri("http://www.wikidata.org/entity/Q1440300"), root: uri("http://www.wikidata.org/entity/Q12518") },
    { class: uri("http://www.wikidata.org/entity/Q40080"), root: uri("http://www.wikidata.org/entity/Q40080") },
    { class: uri("http://www.wikidata.org/entity/Q44539"), root: uri("http://www.wikidata.org/entity/Q44539") },
    { class: uri("http://www.wikidata.org/entity/Q44539"), root: uri("http://www.wikidata.org/entity/Q811979") },
  ));
  test("every root maps to one of the six catalog categories", () => {
    expect(new Set(Object.values(categoryRoots))).toEqual(new Set(["beaches", "culture", "nature", "food", "adventure", "city"]));
  });
  test("a class maps through its root", () => {
    expect(mapCategories({ classIds: ["Q40080"], isWorldHeritage: false, isNationalPark: false }, classRoots)).toEqual(["beaches"]);
    expect(mapCategories({ classIds: ["Q1440300", "Q44539"], isWorldHeritage: false, isNationalPark: false }, classRoots)).toEqual(["city", "culture"]);
  });
  test("unmapped places fall back by designation, and never get an empty or repeated list", () => {
    expect(mapCategories({ classIds: ["Q999"], isWorldHeritage: true, isNationalPark: false }, classRoots)).toEqual(["culture"]);
    expect(mapCategories({ classIds: [], isWorldHeritage: false, isNationalPark: true }, classRoots)).toEqual(["nature"]);
    expect(mapCategories({ classIds: [], isWorldHeritage: false, isNationalPark: false }, classRoots)).toEqual(["city"]);
    expect(mapCategories({ classIds: ["Q40080", "Q40080"], isWorldHeritage: false, isNationalPark: true }, classRoots)).toEqual(["beaches", "nature"]);
  });
});

describe("text helpers", () => {
  test("slugs are readable and end with the Wikidata id", () => {
    expect(slugFor("Château de Versailles", "Q2946")).toBe("chateau-de-versailles-q2946");
    expect(slugFor("หอไอเฟล", "Q123")).toBe("place-q123");
  });
  test("slugs keep letters that do not decompose (æ, ø, ł, ß)", () => {
    expect(slugFor("Ærøskøbing", "Q2")).toBe("aeroskobing-q2");
    expect(slugFor("Łódź", "Q3")).toBe("lodz-q3");
    expect(slugFor("Schloßstraße", "Q4")).toBe("schlossstrasse-q4");
  });
  test("intros are cut at a sentence end within the limit", () => {
    const text = Array.from({ length: 40 }, (_, index) => `Sentence number ${index} is here.`).join(" ");
    const trimmed = trimIntro(text);
    expect(trimmed.length).toBeLessThanOrEqual(600);
    expect(trimmed.endsWith(".")).toBe(true);
  });
  test("Thai text without full stops is cut at a space, not returned whole", () => {
    const thai = Array.from({ length: 60 }, () => "หอไอเฟลเป็นหอคอย").join(" ");
    const short = firstSentence(thai);
    expect(short.length).toBeLessThanOrEqual(160);
    expect(thai.startsWith(short.replace(/…$/, ""))).toBe(true);
    expect(trimIntro(thai).length).toBeLessThanOrEqual(600);
  });
  test("pronunciation leftovers are removed from intros, other brackets kept", () => {
    expect(trimIntro("The Eiffel Tower (  EYE-fəl; French: Tour Eiffel [tuʁ ɛfɛl] ) is a lattice tower (built 1887–1889).")).toBe("The Eiffel Tower is a lattice tower (built 1887–1889).");
    expect(trimIntro("Angkor Wat (; Khmer: អង្គរវត្ត) is a temple.")).toBe("Angkor Wat is a temple.");
    expect(trimIntro("Petra () is a city.")).toBe("Petra is a city.");
  });
  test("first sentence stops at the first full stop", () => {
    expect(firstSentence("The tower is tall. It is in Paris.")).toBe("The tower is tall.");
  });
  test("abbreviations do not end a sentence", () => {
    expect(firstSentence("Mount St. Helens is an active volcano. It erupted in 1980.")).toBe("Mount St. Helens is an active volcano.");
    expect(firstSentence("Yellowstone is a park in the U.S. state of Wyoming. It opened in 1872.")).toBe("Yellowstone is a park in the U.S. state of Wyoming.");
    expect(firstSentence("The Taj Mahal (lit. 'Crown of the Palace') is a mausoleum. It is in Agra.")).toBe("The Taj Mahal (lit. 'Crown of the Palace') is a mausoleum.");
  });
  test("Thai dates such as พ.ศ. and ค.ศ. do not end a sentence", () => {
    expect(firstSentence("วัดพระเชตุพนบูรณะเมื่อ พ.ศ. 2331 โดยพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลก")).toBe("วัดพระเชตุพนบูรณะเมื่อ พ.ศ. 2331 โดยพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลก");
    const long = Array.from({ length: 30 }, () => "สร้างเสร็จใน ค.ศ. 1889").join(" ");
    const short = firstSentence(long);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(160);
  });
  test("clip shortens a fragment at a space without looking for sentences", () => {
    expect(clip("U.S. national park in Utah", 160)).toBe("U.S. national park in Utah");
    const clipped = clip(Array.from({ length: 50 }, () => "word").join(" "), 30);
    expect(clipped.length).toBeLessThanOrEqual(30);
    expect(clipped.endsWith("word…")).toBe(true);
  });
  test("HTML is reduced to plain text", () => {
    expect(stripHtml('<a href="x">Jane&nbsp;Doe</a> &lt;3')).toBe("Jane Doe <3");
  });
  test("the English hash changes when any field changes", () => {
    const text = { name: "A", shortDescription: "B", description: "C" };
    expect(enHash(text)).toMatch(/^[a-f0-9]{64}$/);
    expect(enHash({ ...text, description: "D" })).not.toBe(enHash(text));
  });
  test("distance between Bangkok and Ayutthaya", () => {
    const km = distanceKm({ latitude: 13.7563, longitude: 100.5018 }, { latitude: 14.3532, longitude: 100.5684 });
    expect(km).toBeGreaterThan(60);
    expect(km).toBeLessThan(70);
  });
});

describe("polite fetch", () => {
  test("waits as long as Retry-After asks, then returns the JSON", async () => {
    const sleeps: number[] = [];
    const agents: Array<string | null> = [];
    let calls = 0;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      agents.push(new Headers(init?.headers).get("user-agent"));
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "2" } }) : Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const fetchJson = createPoliteFetch({ userAgent: "TestAgent/1.0", delayMs: 0, fetch: fakeFetch, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await fetchJson("https://example.test/a")).toEqual({ ok: true });
    expect(sleeps.filter((ms) => ms === 2_000)).toHaveLength(1);
    expect(agents).toEqual(["TestAgent/1.0", "TestAgent/1.0"]);
  });
  test("without Retry-After, waits at least five seconds before retrying (Wikimedia's rule)", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fakeFetch = (async () => { calls += 1; return calls === 1 ? new Response("busy", { status: 503 }) : Response.json({ ok: true }); }) as unknown as typeof fetch;
    const fetchJson = createPoliteFetch({ userAgent: "TestAgent/1.0", delayMs: 0, fetch: fakeFetch, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await fetchJson("https://example.test/b")).toEqual({ ok: true });
    expect(sleeps).toEqual([5_000]);
  });
  test("the import is paced for Wikimedia's anonymous limit unless the User-Agent carries contact details", () => {
    expect(wikimediaDelayMs(undefined)).toBeGreaterThanOrEqual(6_000);
    expect(wikimediaDelayMs("")).toBeGreaterThanOrEqual(6_000);
    expect(wikimediaDelayMs("MyTravelSite/1.0 (https://travel.example; ops@example.com)")).toBeLessThanOrEqual(500);
  });
  test("a 200 whose body is cut-off JSON is retried", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fakeFetch = (async () => { calls += 1; return calls === 1 ? new Response('{"head": {"vars"', { status: 200 }) : Response.json({ ok: true }); }) as unknown as typeof fetch;
    const fetchJson = createPoliteFetch({ userAgent: "TestAgent/1.0", delayMs: 0, fetch: fakeFetch, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await fetchJson("https://example.test/c")).toEqual({ ok: true });
    expect(sleeps).toEqual([5_000]);
  });
  test("does not retry a 404", async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls += 1; return new Response("nope", { status: 404 }); }) as unknown as typeof fetch;
    const fetchJson = createPoliteFetch({ userAgent: "TestAgent/1.0", delayMs: 0, fetch: fakeFetch, sleep: async () => {} });
    await expect(fetchJson("https://example.test/missing")).rejects.toThrow("404");
    expect(calls).toBe(1);
  });
});

describe("gemini translator", () => {
  const en = { name: "Eiffel Tower", shortDescription: "Tower in Paris.", description: "A lattice tower in Paris." };
  const items = ["Q1", "Q2", "Q3"].map((qid) => ({ qid, en, need: ["name", "shortDescription", "description"] as Array<"name" | "shortDescription" | "description"> }));
  const geminiReply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
  test("keeps only items that come back complete", async () => {
    const reply = JSON.stringify({ Q1: { name: "หอไอเฟล", shortDescription: "หอคอยในปารีส", description: "หอคอยโครงเหล็กในปารีส" }, Q2: { name: "", shortDescription: "x", description: "y" } });
    let sentKey: string | null = null;
    const translator = createGeminiTranslator("secret", async (url, init) => { sentKey = new Headers(init?.headers).get("x-goog-api-key"); expect(url).not.toContain("secret"); return geminiReply(reply); });
    const result = await translator.translate(items);
    expect([...result.keys()]).toEqual(["Q1"]);
    expect(result.get("Q1")?.name).toBe("หอไอเฟล");
    expect(sentKey as string | null).toBe("secret");
  });
  test("asks Gemini to answer without spending time thinking", async () => {
    let body: { generationConfig?: { thinkingConfig?: { thinkingBudget?: number } } } = {};
    const translator = createGeminiTranslator("secret", async (_url, init) => { body = JSON.parse(String(init?.body)); return geminiReply("{}"); });
    await translator.translate(items);
    expect(body.generationConfig?.thinkingConfig?.thinkingBudget).toBe(0);
  });
  test("a reply that is not JSON gives no translations instead of an error", async () => {
    const translator = createGeminiTranslator("secret", async () => geminiReply("Sorry, I cannot help with that."));
    expect((await translator.translate(items)).size).toBe(0);
  });
  test("a failed request gives no translations instead of an error", async () => {
    const translator = createGeminiTranslator("secret", async () => { throw new Error("HTTP 503"); });
    expect((await translator.translate(items)).size).toBe(0);
  });
});

describe("building import places", () => {
  const entity = (id: string) => `http://www.wikidata.org/entity/${id}`;
  const placeRow = (qid: string, options: { th?: boolean; lat?: number; lon?: number; description?: string } = {}) => row({
    item: uri(entity(qid)), ...(options.description ? { descEn: literal(options.description, "en") } : {}), labelEn: literal(`Place ${qid}`, "en"), labelTh: options.th ? literal(`สถานที่ ${qid}`, "th") : undefined,
    coord: literal(`Point(${options.lon ?? 100} ${options.lat ?? 10})`), class: uri(entity("Q40080")),
    image: uri(`http://commons.wikimedia.org/wiki/Special:FilePath/${qid}.jpg`),
    enwiki: uri(`https://en.wikipedia.org/wiki/Place_${qid}`), thwiki: options.th ? uri(`https://th.wikipedia.org/wiki/Thai_${qid}`) : undefined,
  });
  /** Answers each API the pipeline calls from small in-memory responses. */
  function fakeApis(rows: Array<Record<string, { type: string; value: string }>>, options: { failPhotos?: boolean } = {}): FetchJson {
    return async (url, init) => {
      const target = new URL(url);
      if (target.hostname === "query.wikidata.org") {
        const query = new URLSearchParams(String(init?.body ?? "")).get("query") ?? "";
        if (query.includes("VALUES ?root")) return sparql({ class: uri(entity("Q40080")), root: uri(entity("Q40080")) });
        // ID queries answer with id, kind and sitelinks; detail queries with the full rows for the ids they list.
        if (query.includes("VALUES ?item")) return sparql(...rows.filter((candidate) => query.includes(`wd:${candidate.item!.value.split("/").pop()} `) || query.includes(`wd:${candidate.item!.value.split("/").pop()}}`)));
        return query.includes("Q570116") ? sparql(...rows.map((candidate) => ({ item: candidate.item!, links: candidate.links!, kind: literal("attraction") }))) : sparql();
      }
      const titles = (target.searchParams.get("titles") ?? "").split("|");
      if (target.hostname === "commons.wikimedia.org") {
        if (options.failPhotos) throw new Error("HTTP 500 from commons");
        return { query: { pages: titles.map((title) => ({ title, imageinfo: [{ thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}`, thumbwidth: 1600, thumbheight: 1000, descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`, extmetadata: { Artist: { value: "Jane Doe" }, LicenseShortName: { value: "CC BY 4.0" } } }] })) } };
      }
      const thai = target.hostname === "th.wikipedia.org";
      return { query: { pages: titles.map((title) => ({ title, extract: thai ? `บทนำของ ${title} ยาวพอสมควร` : `${title} is a beach. It is lovely.` })) } };
    };
  }
  const recordingTranslator = (answer: boolean) => {
    const asked: string[] = [];
    const translator: Translator = { async translate(items) { asked.push(...items.map((item) => item.qid)); return new Map(answer ? items.map((item) => [item.qid, { name: "ชื่อแปล", shortDescription: "คำอธิบายสั้น", description: "คำอธิบายยาว" }]) : []); } };
    return { asked, translator };
  };
  const build = (fetchJson: FetchJson, translator: Translator, extra: Partial<Parameters<typeof buildImportPlaces>[0]> = {}) => buildImportPlaces({ fetchJson, translator, minSitelinks: 10, cachedThai: new Map(), curatedPoints: [], ...extra });

  test("Thai from Wikipedia needs no translation", async () => {
    const { asked, translator } = recordingTranslator(true);
    const result = await build(fakeApis([placeRow("Q1", { th: true })]), translator);
    expect(result.complete).toBe(true);
    const place = result.places[0]!;
    expect(place.thSource).toBe("wikipedia");
    expect(place.th.name).toBe("สถานที่ Q1");
    expect(asked).toEqual([]);
    expect(place.categorySlugs).toEqual(["beaches"]);
    expect(place.photo.author).toBe("Jane Doe");
    expect(place.en.shortDescription).toBe("Tower located on the Champ de Mars in Paris, France");
    expect(place.en.description).toBe("Place Q1 is a beach. It is lovely.");
    expect(place.wikipediaUrlEn).toBe("https://en.wikipedia.org/wiki/Place_Q1");
  });
  test("missing Thai is machine-translated, or copied from English when the translator has nothing", async () => {
    const translated = await build(fakeApis([placeRow("Q2")]), recordingTranslator(true).translator);
    expect(translated.places[0]?.thSource).toBe("machine");
    expect(translated.places[0]?.th.name).toBe("ชื่อแปล");
    const fallback = await build(fakeApis([placeRow("Q2")]), recordingTranslator(false).translator);
    expect(fallback.places[0]?.thSource).toBe("english");
    expect(fallback.places[0]?.th).toEqual(fallback.places[0]!.en);
  });
  test("a translator that throws still leaves an English fallback", async () => {
    const result = await build(fakeApis([placeRow("Q2")]), { async translate() { throw new Error("boom"); } });
    expect(result.complete).toBe(true);
    expect(result.places[0]?.thSource).toBe("english");
  });
  test("unchanged English reuses the stored translation; a stored English fallback is retried", async () => {
    const first = await build(fakeApis([placeRow("Q3")]), recordingTranslator(true).translator);
    const stored = first.places[0]!;
    const cachedMachine = new Map([["Q3", { enHash: stored.enHash, thSource: "machine" as const, th: { name: "เก็บไว้", shortDescription: "สั้น", description: "ยาว" } }]]);
    const reuse = recordingTranslator(true);
    const reused = await build(fakeApis([placeRow("Q3")]), reuse.translator, { cachedThai: cachedMachine });
    expect(reuse.asked).toEqual([]);
    expect(reused.places[0]?.th.name).toBe("เก็บไว้");
    const retry = recordingTranslator(true);
    await build(fakeApis([placeRow("Q3")]), retry.translator, { cachedThai: new Map([["Q3", { enHash: stored.enHash, thSource: "english" as const, th: stored.en }]]) });
    expect(retry.asked).toEqual(["Q3"]);
  });
  test("a curated destination's own Wikidata item, or a place within 300 m of it, is skipped; distinct places nearby are kept", async () => {
    const yaowarat = { latitude: 13.7408, longitude: 100.5082, wikidataIds: ["Q9"] };
    const rows = [placeRow("Q9", { lat: 10, lon: 100 }), placeRow("Q10", { lat: 13.742, lon: 100.5085 }), placeRow("Q11", { lat: 13.7465, lon: 100.4927 })];
    const result = await build(fakeApis(rows), recordingTranslator(false).translator, { curatedPoints: [yaowarat] });
    expect(result.places.map((place) => place.raw.qid)).toEqual(["Q11"]);
    expect(result.dropped.nearCurated).toBe(2);
  });
  test("every curated seed destination names its Wikidata items", () => {
    for (const seed of seedDestinations) expect(seed.wikidataIds.length).toBeGreaterThan(0);
    expect(seedDestinations.find((seed) => seed.slug === "yaowarat-road")?.wikidataIds).toEqual(["Q1518029"]);
  });
  test("Wikidata descriptions are kept whole, not cut at abbreviations", async () => {
    const result = await build(fakeApis([placeRow("Q12", { description: "U.S. national park in Utah" })]), recordingTranslator(false).translator);
    expect(result.places[0]?.en.shortDescription).toBe("U.S. national park in Utah");
  });
  test("after two translation batches in a row fail, the rest of the run uses English without asking again", async () => {
    const { asked, translator } = recordingTranslator(false);
    const rows = Array.from({ length: 60 }, (_, index) => placeRow(`Q${100 + index}`));
    const result = await build(fakeApis(rows), translator);
    expect(result.places).toHaveLength(60);
    expect(asked).toHaveLength(40);
    expect(result.places.every((place) => place.thSource === "english")).toBe(true);
  });
  test("a failed photo lookup marks the run incomplete and returns nothing", async () => {
    const result = await build(fakeApis([placeRow("Q6")], { failPhotos: true }), recordingTranslator(false).translator);
    expect(result.complete).toBe(false);
    expect(result.error).toContain("commons");
    expect(result.places).toEqual([]);
  });
  test("a limit keeps the best-known places", async () => {
    const rows = [placeRow("Q7"), { ...placeRow("Q8"), links: literal("500") }];
    const result = await build(fakeApis(rows), recordingTranslator(false).translator, { limit: 1 });
    expect(result.places.map((place) => place.raw.qid)).toEqual(["Q8"]);
  });
});
