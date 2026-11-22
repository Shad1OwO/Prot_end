import type { CategorySlug, RawPlace } from "./types";
import type { SparqlJson } from "./wikidata";

/**
 * Wikidata classes whose subclasses map onto one of the catalog's six categories. Items are typed very specifically
 * (the Eiffel Tower is an "observation tower" and a "lattice tower"), so a SPARQL subclass lookup resolves each
 * item class to these roots rather than matching item classes directly.
 */
export const categoryRoots: Record<string, CategorySlug> = {
  Q40080: "beaches", // beach
  Q33506: "culture", // museum
  Q44539: "culture", // temple
  Q16970: "culture", // church building
  Q32815: "culture", // mosque
  Q44613: "culture", // monastery
  Q23413: "culture", // castle
  Q16560: "culture", // palace
  Q4989906: "culture", // monument
  Q839954: "culture", // archaeological site
  Q207694: "culture", // art museum
  Q46169: "nature", // national park
  Q8502: "nature", // mountain
  Q23397: "nature", // lake
  Q34038: "nature", // waterfall
  Q23442: "nature", // island
  Q179049: "nature", // nature reserve
  Q1107656: "nature", // garden
  Q22698: "nature", // park
  Q174782: "city", // square
  Q79007: "city", // street
  Q12518: "city", // tower
  Q12280: "city", // bridge
  Q11303: "city", // skyscraper
  Q37654: "food", // market
  Q11707: "food", // restaurant
  Q8072: "adventure", // volcano
  Q35509: "adventure", // cave
  Q150784: "adventure", // canyon
  Q35666: "adventure", // glacier
};

/** Classes per lookup query; small enough to stay well inside the query service's limits. */
export const classBatchSize = 200;

export function classifyClassesQuery(classIds: string[]): string {
  const values = classIds.filter((id) => /^Q\d+$/.test(id)).map((id) => `wd:${id}`).join(" ");
  const roots = Object.keys(categoryRoots).map((id) => `wd:${id}`).join(" ");
  return `SELECT DISTINCT ?class ?root WHERE { VALUES ?class { ${values} } VALUES ?root { ${roots} } ?class wdt:P279* ?root }`;
}

/** Class id → the categories its root classes map to. Roots outside `categoryRoots` are ignored. */
export function parseClassRoots(results: SparqlJson | SparqlJson[]): Map<string, CategorySlug[]> {
  const map = new Map<string, CategorySlug[]>();
  for (const result of Array.isArray(results) ? results : [results]) {
    for (const row of result.results.bindings) {
      const classId = row.class?.value.split("/").pop();
      const rootId = row.root?.value.split("/").pop();
      const slug = rootId ? categoryRoots[rootId] : undefined;
      if (!classId || !slug) continue;
      const slugs = map.get(classId) ?? [];
      if (!slugs.includes(slug)) slugs.push(slug);
      map.set(classId, slugs);
    }
  }
  return map;
}

/**
 * Categories for a place, in the order its classes list them. National parks are always nature. World Heritage
 * Sites with no mapped class are culture; anything else unmapped is a city break, so no place has none.
 */
export function mapCategories(place: Pick<RawPlace, "classIds" | "isWorldHeritage" | "isNationalPark">, classRoots: Map<string, CategorySlug[]>): CategorySlug[] {
  const slugs = new Set<CategorySlug>();
  for (const classId of place.classIds) for (const slug of classRoots.get(classId) ?? []) slugs.add(slug);
  if (place.isNationalPark) slugs.add("nature");
  if (slugs.size === 0) slugs.add(place.isWorldHeritage ? "culture" : "city");
  return [...slugs];
}
