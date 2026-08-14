import { describe, expect, it } from "vitest";

import { parseSSE, SSETimeoutError } from "./sse";

const encoder = new TextEncoder();

function sseResponse(parts: (string | Uint8Array)[], hang = false): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (hang) {
        return; // never enqueues, never closes — a silently hung backend
      }
      for (const part of parts) {
        controller.enqueue(typeof part === "string" ? encoder.encode(part) : part);
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("parseSSE", () => {
  it("parses event blocks and JSON data in order", async () => {
    const events: string[][] = [];
    const body =
      "event: start\ndata: {\"query\":\"x\"}\n\n" +
      "event: token\ndata: {\"text\":\"hello\"}\n\n" +
      "event: done\ndata: {\"ok\":true}\n\n";

    await parseSSE(sseResponse([body]), (e) => events.push([e.event, JSON.stringify(e.data)]));

    expect(events).toEqual([
      ["start", JSON.stringify({ query: "x" })],
      ["token", JSON.stringify({ text: "hello" })],
      ["done", JSON.stringify({ ok: true })],
    ]);
  });

  it("handles a single event split across network chunks", async () => {
    const events: string[] = [];
    const body = "event: start\ndata: {\"query\":\"x\"}\n\n";

    await parseSSE(
      sseResponse([body.slice(0, body.length - 5), body.slice(body.length - 5)]),
      (e) => events.push(e.event),
    );

    expect(events).toEqual(["start"]);
  });

  it("flushes a trailing block that lacks the final blank line", async () => {
    const events: unknown[] = [];

    await parseSSE(sseResponse(["event: done\ndata: {\"ok\":true}"]), (e) => events.push(e.data));

    expect(events).toEqual([{ ok: true }]);
  });

  it("rejects with SSETimeoutError when the stream goes silent", async () => {
    await expect(
      parseSSE(sseResponse([], true), () => undefined, { inactivityTimeoutMs: 40 }),
    ).rejects.toBeInstanceOf(SSETimeoutError);
  });

  it("keeps a long stream alive as long as data keeps arriving", async () => {
    const events: string[] = [];
    // Three chunks 80ms apart with a 150ms idle window: total 240ms exceeds the
    // timeout, so this only completes if each chunk resets the timer.
    const chunks = ["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n", "event: c\ndata: 3\n\n"];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk, index) => {
          setTimeout(() => controller.enqueue(encoder.encode(chunk)), index * 80);
        });
        setTimeout(() => controller.close(), chunks.length * 80 + 10);
      },
    });

    await parseSSE(new Response(stream), (e) => events.push(e.event), {
      inactivityTimeoutMs: 150,
    });

    expect(events).toEqual(["a", "b", "c"]);
  });

  it("propagates user aborts as AbortError, never SSETimeoutError", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Simulates the fetch signal abort: the body stream errors with AbortError.
        setTimeout(() => controller.error(new DOMException("aborted", "AbortError")), 20);
      },
    });

    await expect(
      parseSSE(new Response(stream), () => undefined, { inactivityTimeoutMs: 5000 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
