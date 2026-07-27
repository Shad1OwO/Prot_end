import type { Problem } from "@tourism/contracts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(detail);
    this.name = "HttpError";
  }
}

export function problemFromError(error: unknown, requestId: string, instance: string): Problem {
  if (error instanceof HttpError) {
    return {
      type: `https://tourism.example/problems/${error.title.toLowerCase().replaceAll(" ", "-")}`,
      title: error.title,
      status: error.status,
      detail: error.message,
      instance,
      requestId,
      ...(error.errors ? { errors: error.errors } : {}),
    };
  }
  return {
    type: "https://tourism.example/problems/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred.",
    instance,
    requestId,
  };
}
