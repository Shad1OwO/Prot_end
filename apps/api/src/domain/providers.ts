import type { Coordinate, DestinationCard, OAuthProvider } from "@tourism/contracts";
import type { OAuthIdentity } from "./repositories";

export interface OAuthAuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OAuthIdentityProvider {
  provider: OAuthProvider;
  configured: boolean;
  createAuthorizationRequest(redirectUri: string): Promise<OAuthAuthorizationRequest>;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string; expectedNonce: string }): Promise<OAuthIdentity>;
}

export interface RouteEstimate {
  destinationId: string;
  durationMinutes: number | null;
  distanceKm: number | null;
}

export interface MapsRoutingProvider {
  configured: boolean;
  estimate(origin: Coordinate, destinations: DestinationCard[]): Promise<RouteEstimate[]>;
}

export interface MediaUploadTicket {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers: Record<string, string>;
}

export interface ObjectStorageProvider {
  configured: boolean;
  createUploadTicket(input: { fileName: string; contentType: string; sizeBytes: number; sha256: string }): Promise<MediaUploadTicket>;
}
