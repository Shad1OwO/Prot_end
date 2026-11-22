import { clip, stripHtml } from "./text";
import type { Photo } from "./types";

/** Hosts Commons serves files and thumbnails from. Must stay within `allowedImageHosts` in @tourism/contracts. */
export const commonsImageHosts = ["upload.wikimedia.org", "thumb.wikimedia.org"] as const;
export const imageInfoBatchSize = 50;
export const thumbnailWidth = 1600;
const authorMaxLength = 100;

interface ImageInfoResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; missing?: boolean; imageinfo?: Array<{ thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string } | undefined> }> }>;
  };
}

export function imageInfoUrl(titles: string[]): string {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: String(thumbnailWidth), iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl", titles: titles.join("|") });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

function cleanThumbnailUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !(commonsImageHosts as readonly string[]).includes(url.hostname)) return null;
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Keyed by the page title and by every title it was normalised from, so either spelling finds the photo. */
export function parseImageInfo(json: unknown): Map<string, Photo> {
  const query = (json as ImageInfoResponse).query ?? {};
  const photos = new Map<string, Photo>();
  for (const page of query.pages ?? []) {
    const info = page.imageinfo?.[0];
    if (page.missing || !info) continue;
    const url = cleanThumbnailUrl(info.thumburl);
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? "");
    if (!url || !info.thumbwidth || !info.thumbheight || !license || !info.descriptionurl) continue;
    // Some credits list dozens of contributors; a short author keeps the licence visible beside it.
    const author = clip(stripHtml(meta.Artist?.value ?? "") || stripHtml(meta.Credit?.value ?? "") || "Wikimedia Commons", authorMaxLength);
    const licenseUrl = meta.LicenseUrl?.value?.trim();
    photos.set(page.title, { url, width: info.thumbwidth, height: info.thumbheight, author, license, licenseUrl: licenseUrl && /^https?:\/\//.test(licenseUrl) ? licenseUrl : null, pageUrl: info.descriptionurl });
  }
  for (const { from, to } of query.normalized ?? []) {
    const photo = photos.get(to);
    if (photo) photos.set(from, photo);
  }
  return photos;
}
