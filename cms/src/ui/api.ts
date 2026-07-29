import type {
  Annotation,
  AnnotationInput,
  AnnotationListItem,
  ApiErrorBody,
  ImportResult,
  PlaceSummary,
} from "../shared/api.ts";

export class ApiError extends Error {
  messages: string[];

  constructor(messages: string[]) {
    super(messages.join(" "));
    this.messages = messages;
  }
}

const unexpectedErrorMessage = "Unerwarteter Fehler";

export function errorMessagesOf(error: unknown): string[] {
  return error instanceof ApiError ? error.messages : [unexpectedErrorMessage];
}

// Replies that do not come from the API itself (a proxy's error page, say) carry no `ApiErrorBody`.
async function apiErrorOf(response: Response): Promise<ApiError> {
  try {
    const body: Partial<ApiErrorBody> = await response.json();
    return new ApiError(body.errors ?? [unexpectedErrorMessage]);
  } catch {
    return new ApiError([unexpectedErrorMessage]);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, init);
  if (!response.ok) throw await apiErrorOf(response);
  return response;
}

async function requestJson<Body>(path: string, init: RequestInit = {}): Promise<Body> {
  return (await request(path, init)).json();
}

export const fetchAnnotations = (): Promise<AnnotationListItem[]> => requestJson("/api/annotations");

export const fetchPlaces = (): Promise<PlaceSummary[]> => requestJson("/api/places");

export function saveAnnotation(input: AnnotationInput, id: string | null): Promise<Annotation> {
  return requestJson(id === null ? "/api/annotations" : `/api/annotations/${id}`, {
    method: id === null ? "POST" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await request(`/api/annotations/${id}`, { method: "DELETE" });
}

export const importPlaces = (): Promise<ImportResult> => requestJson("/api/places/import", { method: "POST" });
