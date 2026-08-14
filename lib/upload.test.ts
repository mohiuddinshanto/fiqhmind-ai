import { describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/config";
import {
  UploadApiError,
  uploadPdf,
  validateUploadFile,
} from "@/lib/upload";

const UPLOADS_URL = `${API_URL}/uploads`;

function pdfFile(name = "kitab.pdf"): File {
  return new File(["%PDF-1.4 placeholder"], name, { type: "application/pdf" });
}

function uploadResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    filename: "a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf",
    original_filename: "kitab.pdf",
    sha256: "0123456789abcdef",
    size: 15,
    mime: "application/pdf",
    page_count: null,
    storage_path: "storage/uploads/a1b2.pdf",
    status: "queued",
    received_bytes: 15,
    error_message: null,
    uploaded_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
    ...overrides,
  };
}

describe("uploadPdf", () => {
  it("sends a multipart/form-data POST to the uploads endpoint with the file under the `files` field", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(uploadResponse()), { status: 201 }));

    await uploadPdf(pdfFile(), fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(UPLOADS_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ accept: "application/json" });

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const uploaded = body.get("files") as File;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.name).toBe("kitab.pdf");
    expect(uploaded.type).toBe("application/pdf");
  });

  it("resolves with the UploadResponse on 201", async () => {
    const response = uploadResponse();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 201 }));

    await expect(uploadPdf(pdfFile(), fetchMock)).resolves.toEqual(response);
  });

  it("surfaces the backend error message for a 422 validation error", async () => {
    const body = {
      error: { code: "upload_validation_error", message: "invalid pdf: file does not start with %PDF", details: {} },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 422 }));

    await expect(uploadPdf(pdfFile(), fetchMock)).rejects.toMatchObject({
      name: "UploadApiError",
      code: "upload_validation_error",
      status: 422,
      message: "invalid pdf: file does not start with %PDF",
    });
  });

  it("surfaces a safe message for a network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await uploadPdf(pdfFile(), fetchMock).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UploadApiError);
    expect((error as UploadApiError).code).toBe("network");
    expect((error as UploadApiError).status).toBe(0);
    expect((error as UploadApiError).message).toContain("Could not reach the server");
  });

  it("does not touch the network for a rejected file type", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });

    await expect(uploadPdf(txt, fetchMock)).rejects.toMatchObject({
      name: "UploadApiError",
      code: "client_validation",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("validateUploadFile", () => {
  it("accepts a PDF by MIME type", () => {
    expect(validateUploadFile(new File(["%PDF"], "a.pdf", { type: "application/pdf" }))).toBeNull();
  });

  it("accepts a PDF by extension when MIME is empty", () => {
    expect(validateUploadFile(new File(["%PDF"], "a.pdf", { type: "" }))).toBeNull();
  });

  it("rejects non-PDF files", () => {
    expect(validateUploadFile(new File(["x"], "a.txt", { type: "text/plain" }))).toMatch(/PDF/i);
  });
});
