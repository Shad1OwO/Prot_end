import type { CatalogImport, DestinationQuery, Locale } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";

export class CatalogService {
  constructor(readonly repository: AppRepository) {}

  list(query: DestinationQuery, userId?: string) {
    return this.repository.list(query, userId);
  }

  home(locale: Locale, scope: "thailand" | "worldwide", userId?: string) {
    return this.repository.home(locale, scope, userId);
  }

  categories(locale: Locale) {
    return this.repository.categories(locale);
  }

  async detail(slug: string, locale: Locale, userId?: string) {
    const destination = await this.repository.getBySlug(slug, locale, userId);
    if (!destination) throw new HttpError(404, "Destination Not Found", "The requested destination is unavailable or archived.");
    return destination;
  }

  import(input: CatalogImport) {
    return this.repository.importCatalog(input);
  }
}
