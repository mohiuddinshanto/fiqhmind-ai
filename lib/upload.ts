import { API_URL } from "@/lib/config";

export interface UploadResponse {
  id: string;
  filename: string;
  original_filename: string;
  sha256: string | null;
  size: number | null;
  mime: string | null;
  page_count: number | null;
  storage_path: string | null;
  status: string;
  received_bytes: number;
  error_message: string | null;
  uploaded_at: string;
  updated_at: string;
}

export interface UploadErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

/** Client-side mirrors of the backend limits (the server stays authoritative). */
export const UPLOAD_MAX_SIZE_BYTES = 200 * 1024 * 1024;

/** Matches the backend `upload_allowed_mime`; the server also checks magic bytes. */
export const ALLOWED_UPLOAD_MIME = "application/pdf";

export class UploadApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | null;

  constructor(code: string, message: string, status: number, details?: UploadErrorDetail["details"]) {
    super(message);
    this.name = "UploadApiError";
    this.code = code;
    this.status = status;
    this.details = details ?? null;
  }
}

export function validateUploadFile(file: File): string | null {
  const isPdf =
    file.type === ALLOWED_UPLOAD_MIME || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return "Only PDF files are accepted.";
  }
  if (file.size > UPLOAD_MAX_SIZE_BYTES) {
    return "The file is too large. The maximum size is 200 MB.";
  }
  return null;
}

/**
 * Upload a single PDF to `POST /api/v1/uploads` (multipart/form-data, field
 * name `files`) and resolve with the backend `UploadResponse` on 201.
 *
 * Backend validation errors arrive as `{"error": {"code", "message"}}` and are
 * surfaced as `UploadApiError` so the UI can render the server's message
 * verbatim without leaking any internals.
 */
export async function uploadPdf(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResponse> {
  const validationError = validateUploadFile(file);
  if (validationError) {
    throw new UploadApiError("client_validation", validationError, 0);
  }

  const form = new FormData();
  form.append("files", file, file.name);

  let response: Response;
  try {
    response = await fetchImpl(`${API_URL}/uploads`, {
      method: "POST",
      body: form,
      headers: { accept: "application/json" },
    });
  } catch {
    throw new UploadApiError(
      "network",
      "Could not reach the server. Make sure the backend is running and reachable.",
      0,
    );
  }

  if (response.ok) {
    return (await response.json()) as UploadResponse;
  }

  let detail: UploadErrorDetail | null = null;
  try {
    const body = (await response.json()) as { error?: UploadErrorDetail } | null;
    detail = body?.error ?? null;
  } catch {
    // non-JSON error body — fall back to the generic message below
  }

  throw new UploadApiError(
    detail?.code ?? `http_${response.status}`,
    detail?.message ?? `Upload failed (HTTP ${response.status}).`,
    response.status,
    detail?.details,
  );
}
