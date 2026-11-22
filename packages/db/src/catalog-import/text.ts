import type { PlaceText } from "./types";

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Reduces an HTML fragment (Commons credit fields) to plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, name: string) => {
      const lower = name.toLowerCase();
      if (entities[lower]) return entities[lower];
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin letters that NFKD leaves whole, spelled the way English writes them. */
const looseLetters: Record<string, string> = { æ: "ae", ø: "o", œ: "oe", ł: "l", ß: "ss", đ: "d", ð: "d", þ: "th", ı: "i", ħ: "h" };

/** A readable, stable slug: the English name plus the Wikidata id, so two places can never share one. */
export function slugFor(nameEn: string, qid: string): string {
  const words = nameEn
    .toLowerCase()
    .replace(/[æøœłßđðþıħ]/g, (letter) => looseLetters[letter] ?? letter)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${words || "place"}-${qid.toLowerCase()}`;
}

/**
 * Wikipedia's plain-text intros keep what is left of pronunciation templates: brackets holding IPA, or starting
 * with a semicolon, or empty. Ordinary brackets ("(built 1887–1889)") are kept.
 */
const pronunciationDebris = /\s*\((?:[^()]*\[[^\]]*\][^()]*|\s*;[^()]*|\s*)\)/g;

/** Words that end in a full stop without ending the sentence. */
const abbreviations = new Set(["st", "mt", "ft", "dr", "mr", "mrs", "ms", "jr", "sr", "no", "vs", "lit", "c", "ca", "approx", "est", "etc", "e.g", "i.e", "u.s", "u.k", "a.d", "b.c"]);

/** Where sentences end: a mark followed by the end of the text, or by a space and something that is not lower case. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (const match of text.matchAll(/[.!?。](?=\s+[^\p{Ll}]|$)/gu)) {
    const index = match.index ?? 0;
    if (match[0] === ".") {
      const word = (text.slice(0, index).match(/[\p{L}.]+$/u)?.[0] ?? "").toLowerCase();
      // "U.S." and "St." are not sentence ends; a single letter before the stop is an initial.
      if (abbreviations.has(word) || /^\p{L}$/u.test(word) || /^(?:\p{L}\.)+\p{L}$/u.test(word)) continue;
    }
    ends.push(index + 1);
  }
  return ends;
}

/** Thai uses spaces, not full stops, between sentences; its full stops belong to abbreviations such as พ.ศ. */
function isMostlyThai(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const thai = text.match(/[฀-๿]/g)?.length ?? 0;
  return letters > 0 && thai * 2 > letters;
}

function tidy(text: string): string {
  return text.replace(pronunciationDebris, "").replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

/** Shortens text to `max` characters at a space, with an ellipsis, without looking for sentences. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const space = clean.lastIndexOf(" ", max - 1);
  return `${clean.slice(0, space > max / 2 ? space : max - 1).replace(/[\s,;:]+$/, "")}…`;
}

/** Cuts at the last sentence end within `max` (or the first, for `firstOnly`); otherwise clips at a space. */
function cut(text: string, max: number, firstOnly: boolean): string {
  const clean = tidy(text);
  if (!firstOnly && clean.length <= max) return clean;
  const ends = isMostlyThai(clean) ? [] : sentenceEnds(clean).filter((end) => end <= max);
  const end = firstOnly ? ends[0] : ends.at(-1);
  return end ? clean.slice(0, end) : clip(clean, max);
}

export function trimIntro(text: string, max = 600): string {
  return cut(text, max, false);
}

export function firstSentence(text: string, max = 160): string {
  return cut(text, max, true);
}

export function enHash(text: PlaceText): string {
  return Bun.CryptoHasher.hash("sha256", `${text.name}\n${text.shortDescription}\n${text.description}`, "hex");
}

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Upper-cases the first letter (Wikidata descriptions are lower-case fragments). */
export function capitalise(text: string): string {
  return text ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}
