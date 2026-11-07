import { HttpError } from "./errors";

/** Well above the largest public payload, yet small enough to cap validation memory use. */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/**
 * Rejects oversized bodies from their headers, before anything reads or parses them.
 * Chunked bodies are refused outright because their size cannot be known up front.
 */
export function assertRequestBodyWithinLimit(request: Request, maxBytes = MAX_REQUEST_BODY_BYTES): void {
  if (request.headers.has("transfer-encoding")) {
    throw new HttpError(411, "Length Required", "Requests with a body must declare a Content-Length.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return;
  if (!/^\d+$/.test(contentLength)) {
    throw new HttpError(400, "Invalid Content Length", "The Content-Length header is not valid.");
  }
  if (Number(contentLength) > maxBytes) {
    throw new HttpError(413, "Payload Too Large", `The request body must not exceed ${maxBytes} bytes.`);
  }
}
