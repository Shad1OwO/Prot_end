import type {
  Category,
  DestinationDetail,
  DestinationListResponse,
  DestinationQuery,
  HomeSections,
  Locale,
  Problem,
  RecommendationResult,
  SessionResponse,
  Trip,
  UserPreferences,
} from "@tourism/contracts";

export const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem) {
    super(problem.detail);
    this.name = "ApiError";
  }
}

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=").slice(1).join("=");
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const csrf = csrfToken();
  if (csrf && init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase())) headers.set("x-csrf-token", decodeURIComponent(csrf));
  const response = await fetch(`${apiOrigin}${path}`, { ...init, headers, credentials: "include", cache: init.cache ?? "no-store" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as T | Problem | null;
  if (!response.ok) {
    const problem = body && typeof body === "object" && "status" in body ? body as Problem : { type: "about:blank", title: "Request failed", status: response.status, detail: `Request failed with HTTP ${response.status}` };
    throw new ApiError(response.status, problem);
  }
  return body as T;
}

export function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const value = params.toString();
  return value ? `?${value}` : "";
}

export const catalogApi = {
  home: (locale: Locale, scope: "thailand" | "worldwide") => apiFetch<HomeSections>(`/api/v1/catalog/home${queryString({ locale, scope })}`),
  destinations: (query: Partial<DestinationQuery>) => apiFetch<DestinationListResponse>(`/api/v1/destinations${queryString(query as Record<string, string | number | undefined>)}`),
  destination: (slug: string, locale: Locale) => apiFetch<DestinationDetail>(`/api/v1/destinations/${encodeURIComponent(slug)}${queryString({ locale })}`),
  categories: (locale: Locale) => apiFetch<Category[]>(`/api/v1/categories${queryString({ locale })}`),
};

export const authApi = {
  me: () => apiFetch<SessionResponse>("/api/v1/auth/me"),
  developmentSession: () => apiFetch<SessionResponse>("/api/v1/auth/development-session", { method: "POST" }),
  logout: () => apiFetch<void>("/api/v1/auth/logout", { method: "POST" }),
};

export const userApi = {
  favorites: (locale: Locale) => apiFetch<{ items: DestinationListResponse["items"] }>(`/api/v1/favorites${queryString({ locale })}`),
  favorite: (id: string, enabled: boolean) => apiFetch<void>(`/api/v1/destinations/${id}/favorite`, { method: enabled ? "PUT" : "DELETE" }),
  like: (id: string, enabled: boolean) => apiFetch<void>(`/api/v1/destinations/${id}/like`, { method: enabled ? "PUT" : "DELETE" }),
  profile: (input: { displayName?: string; locale?: Locale }) => apiFetch<SessionResponse["user"]>("/api/v1/profile", { method: "PATCH", body: JSON.stringify(input) }),
  preferences: (input: UserPreferences) => apiFetch<UserPreferences>("/api/v1/preferences", { method: "PUT", body: JSON.stringify(input) }),
};

export const tripApi = {
  list: (locale: Locale) => apiFetch<{ items: Trip[] }>(`/api/v1/trips${queryString({ locale })}`),
  get: (id: string, locale: Locale) => apiFetch<Trip>(`/api/v1/trips/${id}${queryString({ locale })}`),
  create: (locale: Locale, input: { name: string; startDate?: string | null; endDate?: string | null; notes?: string | null }) => apiFetch<Trip>(`/api/v1/trips${queryString({ locale })}`, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, locale: Locale, input: Partial<{ name: string; startDate: string | null; endDate: string | null; notes: string | null }>) => apiFetch<Trip>(`/api/v1/trips/${id}${queryString({ locale })}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<void>(`/api/v1/trips/${id}`, { method: "DELETE" }),
  addDestination: (tripId: string, destinationId: string, locale: Locale) => apiFetch<Trip>(`/api/v1/trips/${tripId}/destinations${queryString({ locale })}`, { method: "POST", body: JSON.stringify({ destinationId }) }),
  removeDestination: (tripId: string, destinationId: string, locale: Locale) => apiFetch<Trip>(`/api/v1/trips/${tripId}/destinations/${destinationId}${queryString({ locale })}`, { method: "DELETE" }),
  reorder: (tripId: string, destinationIds: string[], locale: Locale) => apiFetch<Trip>(`/api/v1/trips/${tripId}/destinations/order${queryString({ locale })}`, { method: "PUT", body: JSON.stringify({ destinationIds }) }),
};

export const recommendationApi = {
  create: (input: unknown) => apiFetch<{ job: { id: string }; statusUrl: string; eventsUrl: string }>("/api/v1/recommendations", { method: "POST", body: JSON.stringify(input) }),
  status: (id: string, locale: Locale) => apiFetch<RecommendationResult>(`/api/v1/recommendations/${id}${queryString({ locale })}`),
};
