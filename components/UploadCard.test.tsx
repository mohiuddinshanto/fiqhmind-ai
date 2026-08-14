// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import UploadCard from "@/components/UploadCard";

function uploadResponse() {
  return {
    id: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    filename: "a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf",
    original_filename: "kitab.pdf",
    sha256: "0123456789abcdef0123456789abcdef",
    size: 15,
    mime: "application/pdf",
    page_count: null,
    storage_path: "storage/uploads/a1b2.pdf",
    status: "queued",
    received_bytes: 15,
    error_message: null,
    uploaded_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  };
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) throw new Error("file input not found");
  return input;
}

function pdfFile(name = "kitab.pdf"): File {
  return new File(["%PDF-1.4 placeholder"], name, { type: "application/pdf" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("UploadCard", () => {
  it("renders a file picker and a disabled Upload button until a file is chosen", () => {
    render(<UploadCard />);

    expect(getFileInput()).toBeInTheDocument();
    const uploadButton = screen.getByRole("button", { name: "Upload" });
    expect(uploadButton).toBeDisabled();
  });

  it("enables the Upload button after selecting a valid PDF", async () => {
    const user = userEvent.setup();
    render(<UploadCard />);

    await user.upload(getFileInput(), pdfFile());

    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(screen.getByText(/kitab\.pdf/)).toBeInTheDocument();
  });

  it("shows a client-side validation message for a non-PDF file", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<UploadCard />);

    await user.upload(getFileInput(), new File(["x"], "notes.txt", { type: "text/plain" }));

    expect(screen.getByText("Only PDF files are accepted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("shows a success state after a 201 upload and allows selecting another file", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(uploadResponse()), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCard />);
    await user.upload(getFileInput(), pdfFile());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText(/uploaded successfully/)).toBeInTheDocument();
    expect(screen.getByText(/Queued for ingestion/)).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: "Upload another" });
    await user.click(resetButton);

    expect(getFileInput()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("renders the backend validation error message on failure", async () => {
    const user = userEvent.setup();
    const body = {
      error: {
        code: "upload_validation_error",
        message: "invalid pdf: file does not start with %PDF",
        details: {},
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCard />);
    await user.upload(getFileInput(), pdfFile());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("invalid pdf: file does not start with %PDF")).toBeInTheDocument();
  });

  it("shows a loading state and prevents duplicate submission while uploading", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCard />);
    await user.upload(getFileInput(), pdfFile());

    const uploadButton = screen.getByRole("button", { name: "Upload" });
    await user.click(uploadButton);

    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second click while in-flight must not fire another request.
    fireEvent.click(screen.getByRole("button", { name: "Uploading…" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify(uploadResponse()), { status: 201 }));
    await waitFor(() => expect(screen.getByText(/uploaded successfully/)).toBeInTheDocument());
  });
});
