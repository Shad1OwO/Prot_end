import type { RawPlace } from "./types";

export const sparqlEndpoint = "https://query.wikidata.org/sparql";

interface Binding { type: string; value: string; "xml:lang"?: string; datatype?: string }
export interface SparqlJson { head?: { vars: string[] }; results: { bindings: Array<Record<string, Binding>> } }

/**
 * The kinds of place the catalog imports, one SPARQL query each so no single query nears the service's 60 s limit.
 * Each clause binds ?kind so a merged item knows whether it is a World Heritage Site or a national park.
 */
export const classClauses = {
  attraction: `?item wdt:P31/wdt:P279* wd:Q570116. BIND("attraction" AS ?kind)`,
  heritage: `?item wdt:P1435 wd:Q9259. BIND("heritage" AS ?kind)`,
  park: `?item wdt:P31 wd:Q46169. BIND("park" AS ?kind)`,
} as const;
export type PlaceKind = keyof typeof classClauses;

/** Cheap: only ids, kind and notability. Joining the details here makes the service time out (HTTP 504). */
export function buildIdsQuery(clause: string, minSitelinks: number): string {
  return `SELECT DISTINCT ?item ?kind ?links WHERE { ${clause} ?item wikibase:sitelinks ?links. FILTER(?links >= ${Math.trunc(minSitelinks)}) }`;
}

export const detailsBatchSize = 200;

export function buildDetailsQuery(qids: string[]): string {
  const values = qids.filter((qid) => /^Q\d+$/.test(qid)).map((qid) => `wd:${qid} `).join("");
  return `SELECT ?item ?labelEn ?labelTh ?descEn ?coord ?iso ?countryEn ?countryTh ?class ?image ?enwiki ?thwiki WHERE {
  VALUES ?item { ${values}}
  ?item wdt:P625 ?coord; wdt:P18 ?image; wdt:P17 ?country.
  ?country wdt:P297 ?iso.
  ?item rdfs:label ?labelEn. FILTER(LANG(?labelEn) = "en")
  OPTIONAL { ?item rdfs:label ?labelTh. FILTER(LANG(?labelTh) = "th") }
  OPTIONAL { ?item schema:description ?descEn. FILTER(LANG(?descEn) = "en") }
  OPTIONAL { ?item wdt:P31 ?class }
  OPTIONAL { ?country rdfs:label ?countryEn. FILTER(LANG(?countryEn) = "en") }
  OPTIONAL { ?country rdfs:label ?countryTh. FILTER(LANG(?countryTh) = "th") }
  OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?thwiki schema:about ?item; schema:isPartOf <https://th.wikipedia.org/> }
}`;
}

const entityId = (value: string) => value.slice(value.lastIndexOf("/") + 1);

/** `http://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel_2.jpg` → `File:Tour Eiffel 2.jpg`. */
export function fileTitleFromCommonsUrl(url: string): string {
  const name = url.slice(url.lastIndexOf("/") + 1);
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Keep the raw name; the Commons lookup will simply not find it.
  }
  return `File:${decoded.replaceAll("_", " ")}`;
}

function wikiTitle(url: string): string {
  const name = url.slice(url.indexOf("/wiki/") + "/wiki/".length);
  try {
    return decodeURIComponent(name).replaceAll("_", " ");
  } catch {
    return name.replaceAll("_", " ");
  }
}

/** Only earth coordinates are written as a bare `Point(lon lat)`; other globes carry a prefix and are rejected. */
function parsePoint(value: string): { latitude: number; longitude: number } | null {
  const match = /^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(value.trim());
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

interface Accumulator { labelEn?: string; labelTh?: string; descEn?: string; coords: Set<string>; countries: Map<string, { en?: string; th?: string }>; classes: Set<string>; images: Set<string>; enwiki?: string; thwiki?: string; links: number; kinds: Set<string> }

/** Merges every row of every query by item, picking among repeated values in sorted order so runs are repeatable. */
export function parsePlaces(results: SparqlJson[]): RawPlace[] {
  const items = new Map<string, Accumulator>();
  for (const result of results) {
    for (const row of result.results.bindings) {
      const itemUrl = row.item?.value;
      if (!itemUrl) continue;
      const qid = entityId(itemUrl);
      let item = items.get(qid);
      if (!item) {
        item = { coords: new Set(), countries: new Map(), classes: new Set(), images: new Set(), links: 0, kinds: new Set() };
        items.set(qid, item);
      }
      if (row.labelEn) item.labelEn = row.labelEn.value;
      if (row.labelTh) item.labelTh = row.labelTh.value;
      if (row.descEn) item.descEn = row.descEn.value;
      if (row.coord) item.coords.add(row.coord.value);
      if (row.iso) {
        const country = item.countries.get(row.iso.value) ?? {};
        if (row.countryEn) country.en = row.countryEn.value;
        if (row.countryTh) country.th = row.countryTh.value;
        item.countries.set(row.iso.value, country);
      }
      if (row.class) item.classes.add(entityId(row.class.value));
      if (row.image) item.images.add(fileTitleFromCommonsUrl(row.image.value));
      if (row.enwiki) item.enwiki = wikiTitle(row.enwiki.value);
      if (row.thwiki) item.thwiki = wikiTitle(row.thwiki.value);
      if (row.links) item.links = Math.max(item.links, Number(row.links.value) || 0);
      if (row.kind) item.kinds.add(row.kind.value);
    }
  }
  const places: RawPlace[] = [];
  for (const [qid, item] of items) {
    const point = [...item.coords].sort().map(parsePoint).find((candidate) => candidate !== null);
    const countryCode = [...item.countries.keys()].filter((code) => /^[A-Z]{2}$/.test(code)).sort()[0];
    const imageFile = [...item.images].sort()[0];
    if (!item.labelEn || !point || !countryCode || !imageFile) continue;
    const country = item.countries.get(countryCode) ?? {};
    places.push({
      qid,
      labelEn: item.labelEn,
      labelTh: item.labelTh ?? null,
      descriptionEn: item.descEn ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      countryCode,
      countryNameEn: country.en ?? countryCode,
      countryNameTh: country.th ?? null,
      classIds: [...item.classes].sort(),
      isWorldHeritage: item.kinds.has("heritage"),
      isNationalPark: item.kinds.has("park"),
      imageFile,
      enwikiTitle: item.enwiki ?? null,
      thwikiTitle: item.thwiki ?? null,
      sitelinks: item.links,
    });
  }
  return places;
}
