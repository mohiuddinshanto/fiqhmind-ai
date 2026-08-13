"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseSSE, type SSEEvent } from "@/lib/sse";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const LANGUAGES = [
  { code: "bn", label: "বাংলা" },
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
] as const;

type Language = (typeof LANGUAGES)[number]["code"];

interface ChatAnswer {
  answer_language: string;
  explanation: { type: string; html: string };
  arabic_quotes: {
    text: string;
    translation?: string | null;
    region?: string | null;
  }[];
  citations: {
    chunk_id: string;
    book?: string | null;
    volume?: string | null;
    page?: string | null;
    chapter?: string | null;
  }[];
  confidence: {
    level: string;
    retrieval_score: number;
    source_agreement: string;
    rationale: string;
  };
  refusal?: { reason: string; closest_evidence: string[] } | null;
  caveats: string[];
  related: string[];
}

interface Turn {
  id: string;
  question: string;
  language: Language;
  status: "streaming" | "done" | "error";
  explanation: string;
  answer?: ChatAnswer;
  error?: string;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<Language>("bn");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }, []);

  const ask = useCallback(async () => {
    const query = question.trim();
    if (!query || busy) {
      return;
    }
    const id = newId();
    setTurns((prev) => [...prev, { id, question: query, language, status: "streaming", explanation: "" }]);
    setQuestion("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ query, answer_language: language, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = `Request failed (HTTP ${response.status})`;
        try {
          const body = await response.json();
          message = body?.error?.message ?? message;
        } catch {
          // non-JSON error body — keep the generic message
        }
        throw new Error(message);
      }

      await parseSSE(response, (event: SSEEvent) => {
        if (event.event === "token") {
          const text = (event.data as { text?: string })?.text ?? "";
          setTurns((prev) =>
            prev.map((turn) =>
              turn.id === id ? { ...turn, explanation: turn.explanation + text } : turn,
            ),
          );
        } else if (event.event === "done") {
          const answer = event.data as ChatAnswer;
          updateTurn(id, {
            status: "done",
            // The validated answer is authoritative — replace the live stream.
            explanation: answer.explanation.html,
            answer,
          });
        } else if (event.event === "error") {
          const message = (event.data as { message?: string })?.message ?? "The stream failed.";
          updateTurn(id, { status: "error", error: message });
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateTurn(id, { status: "error", error: "Stream aborted." });
      } else {
        const message = err instanceof Error ? err.message : "Network error";
        updateTurn(id, { status: "error", error: message });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [question, language, busy, updateTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-800/10 bg-white/70 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">FiqhMind AI</h1>
          <p className="hidden text-sm text-emerald-900/60 sm:block">
            Grounded in the Arabic Hanafi fiqh corpus
          </p>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-6">
        {turns.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-xl text-lg leading-relaxed text-emerald-900/80">
              Ask a question about Islamic rulings (fiqh) — every answer is backed by a verbatim
              Arabic quotation with book, volume, and page citations.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {LANGUAGES.map((lang) => (
                <span
                  key={lang.code}
                  className="rounded-full border border-emerald-800/20 bg-white px-4 py-1 text-sm text-emerald-900"
                >
                  {lang.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((turn) => (
              <TurnCard key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-6">
        <div className="rounded-xl border border-emerald-800/15 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="language" className="text-sm text-emerald-900/70">
              Answer language
            </label>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              disabled={busy}
              className="rounded-md border border-emerald-800/20 bg-white px-2 py-1 text-sm text-emerald-900 disabled:opacity-50"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              rows={2}
              placeholder="Ask a fiqh question in Bengali, Arabic, or English…"
              disabled={busy}
              className="min-h-0 flex-1 resize-none rounded-md border border-emerald-800/20 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-700 disabled:opacity-50"
            />
            {busy ? (
              <Button size="lg" variant="outline" onClick={stop}>
                Stop
              </Button>
            ) : (
              <Button size="lg" onClick={() => void ask()} disabled={!question.trim()}>
                Ask
              </Button>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

function TurnCard({ turn }: { turn: Turn }) {
  const confidence = turn.answer?.confidence;
  const refusal = turn.answer?.refusal;

  return (
    <article className="rounded-xl border border-emerald-800/15 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-medium text-emerald-950">{turn.question}</p>
        <span className="text-xs text-emerald-900/50">
          {turn.language === "bn" ? "বাংলা" : turn.language === "ar" ? "العربية" : "English"}
        </span>
      </div>

      {turn.status === "streaming" && (
        <p className="flex items-center gap-2 text-sm text-emerald-900/60">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
          Generating answer…
        </p>
      )}

      {turn.status === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{turn.error}</p>
      )}

      {turn.explanation && (
        <div
          className="prose-sm mt-2 space-y-2 text-sm leading-relaxed text-emerald-950 [&_cite]:not-italic [&_cite]:text-emerald-800"
          dangerouslySetInnerHTML={{ __html: turn.explanation }}
        />
      )}

      {refusal && refusal.reason === "insufficient_evidence" && (
        <p className="mt-3 text-xs text-emerald-900/60">
          Not enough evidence was found in the corpus to answer this question.
        </p>
      )}

      {confidence && (
        <p className="mt-3 text-xs text-emerald-900/60">
          Confidence: <strong>{confidence.level}</strong> · {confidence.source_agreement} ·{" "}
          {confidence.rationale}
        </p>
      )}

      {turn.answer?.arabic_quotes.length ? (
        <div className="mt-3 space-y-2">
          {turn.answer.arabic_quotes.map((quote, index) => (
            <blockquote
              key={index}
              className="rounded-md bg-emerald-50/70 px-3 py-2 text-right text-base leading-relaxed text-emerald-950"
            >
              <span className="block" dir="rtl">
                {quote.text}
              </span>
              {quote.translation ? (
                <footer className="mt-1 text-left text-xs text-emerald-900/60">
                  {quote.translation}
                </footer>
              ) : null}
            </blockquote>
          ))}
        </div>
      ) : null}

      {turn.answer?.citations.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {turn.answer.citations.map((citation) => (
            <li
              key={citation.chunk_id}
              className="rounded-full border border-emerald-800/20 bg-white px-3 py-1 text-xs text-emerald-900"
            >
              {citation.book}
              {citation.volume ? ` · vol. ${citation.volume}` : ""}
              {citation.page ? ` · p. ${citation.page}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {turn.answer?.caveats.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-emerald-900/60">
          {turn.answer.caveats.map((caveat, index) => (
            <li key={index}>{caveat}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
