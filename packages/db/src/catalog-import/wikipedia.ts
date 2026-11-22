interface ExtractsResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; extract?: string; missing?: boolean }>;
  };
}

/** Up to 20 intros per request: the API's limit for `exintro` extracts. */
export const extractsBatchSize = 20;

export function extractsUrl(lang: "en" | "th", titles: string[]): string {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1", exlimit: String(extractsBatchSize), titles: titles.join("|") });
  return `https://${lang}.wikipedia.org/w/api.php?${params}`;
}

export function articleUrl(lang: "en" | "th", title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

export function titleFromArticleUrl(url: string): string {
  const name = url.slice(url.indexOf("/wiki/") + "/wiki/".length);
  try {
    return decodeURIComponent(name).replaceAll("_", " ");
  } catch {
    return name.replaceAll("_", " ");
  }
}

/** Maps every title we asked for (and the titles it was normalised or redirected to) to the plain-text intro. */
export function parseExtracts(json: unknown): Map<string, string> {
  const query = (json as ExtractsResponse).query ?? {};
  const byTitle = new Map<string, string>();
  for (const page of query.pages ?? []) {
    const extract = page.extract?.trim();
    if (!page.missing && extract) byTitle.set(page.title, extract);
  }
  const aliases = [...(query.redirects ?? []), ...(query.normalized ?? [])];
  // A title can be normalised and then redirected, so resolve the chain a few steps.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const { from, to } of aliases) {
      const extract = byTitle.get(to);
      if (extract && !byTitle.has(from)) byTitle.set(from, extract);
    }
  }
  return byTitle;
}
