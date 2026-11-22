export type CategorySlug = "beaches" | "culture" | "nature" | "food" | "adventure" | "city";
export type ThaiSource = "wikipedia" | "machine" | "english";

/** One Wikidata item after merging every SPARQL row returned for it. */
export interface RawPlace {
  qid: string;
  labelEn: string;
  labelTh: string | null;
  descriptionEn: string | null;
  latitude: number;
  longitude: number;
  countryCode: string;
  countryNameEn: string;
  countryNameTh: string | null;
  classIds: string[];
  isWorldHeritage: boolean;
  isNationalPark: boolean;
  /** Commons title, for example "File:Tour Eiffel.jpg". */
  imageFile: string;
  enwikiTitle: string | null;
  thwikiTitle: string | null;
  sitelinks: number;
}

export interface Photo {
  url: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseUrl: string | null;
  /** The Commons file page, where the full credit and licence live. */
  pageUrl: string;
}

export interface PlaceText {
  name: string;
  shortDescription: string;
  description: string;
}

export interface ImportPlace {
  raw: RawPlace;
  slug: string;
  categorySlugs: CategorySlug[];
  photo: Photo;
  en: PlaceText;
  th: PlaceText;
  thSource: ThaiSource;
  enHash: string;
  wikipediaUrlEn: string | null;
  wikipediaUrlTh: string | null;
}

/** Fetches a URL and returns its parsed JSON body. */
export type FetchJson = (url: string, init?: RequestInit) => Promise<unknown>;
