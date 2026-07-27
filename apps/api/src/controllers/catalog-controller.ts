import { catalogImportSchema, destinationQuerySchema, localeSchema, scopeSchema } from "@tourism/contracts";
import type { CatalogService } from "../services/catalog-service";
import { parseInput } from "../http/validation";

export class CatalogController {
  constructor(readonly service: CatalogService) {}

  list(query: unknown, userId?: string) {
    return this.service.list(parseInput(destinationQuerySchema, query), userId);
  }

  home(query: unknown, userId?: string) {
    const input = query as Record<string, unknown>;
    return this.service.home(parseInput(localeSchema, input.locale ?? "en"), parseInput(scopeSchema, input.scope ?? "thailand"), userId);
  }

  detail(slug: string, query: unknown, userId?: string) {
    const input = query as Record<string, unknown>;
    return this.service.detail(slug, parseInput(localeSchema, input.locale ?? "en"), userId);
  }

  categories(query: unknown) {
    const input = query as Record<string, unknown>;
    return this.service.categories(parseInput(localeSchema, input.locale ?? "en"));
  }

  import(body: unknown) {
    return this.service.import(parseInput(catalogImportSchema, body));
  }
}
