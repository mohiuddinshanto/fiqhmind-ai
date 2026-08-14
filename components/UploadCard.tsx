"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { UploadApiError, uploadPdf, type UploadResponse } from "@/lib/upload";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadCard() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectFile = (selected: File | null) => {
    setError(null);
    setResult(null);
    if (!selected) {
      setFile(null);
      setValidationError(null);
      return;
    }
    const isPdf =
      selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFile(null);
      setValidationError("Only PDF files are accepted.");
      return;
    }
    if (selected.size > 200 * 1024 * 1024) {
      setFile(null);
      setValidationError("The file is too large. The maximum size is 200 MB.");
      return;
    }
    setValidationError(null);
    setFile(selected);
  };

  const upload = async () => {
    if (!file || uploading) {
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const response = await uploadPdf(file);
      setResult(response);
    } catch (err) {
      setError(
        err instanceof UploadApiError
          ? err.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setValidationError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-emerald-800/15 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-emerald-950">Add a book (PDF)</h2>
        {result ? (
          <span className="text-xs text-emerald-800">Queued for ingestion</span>
        ) : null}
      </div>

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p>
              <strong>{result.original_filename}</strong> uploaded successfully.
            </p>
            <p className="mt-1 text-xs text-emerald-900/70">
              Upload ID: {result.id} · Status: {result.status} ·{" "}
              {result.size !== null ? `${formatBytes(result.size)} · ` : ""}
              SHA-256: {result.sha256?.slice(0, 16)}…
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reset} className="self-start">
            Upload another
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              disabled={uploading}
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-emerald-950 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-emerald-800 disabled:opacity-50"
            />
            <Button type="button" onClick={() => void upload()} disabled={!file || uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>

          {file ? (
            <p className="text-xs text-emerald-900/70">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}

          {uploading ? (
            <p className="flex items-center gap-2 text-xs text-emerald-900/60">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
              Uploading — this can take a moment for large files…
            </p>
          ) : null}

          {validationError ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {validationError}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
