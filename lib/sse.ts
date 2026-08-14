export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface SSEOptions {
  /**
   * Idle window in milliseconds. If no bytes arrive within the window the
   * stream is considered hung and `parseSSE` rejects with `SSETimeoutError`.
   * Every chunk of data resets the timer, so long-lived streams stay valid as
   * long as data keeps arriving. Defaults to no timeout.
   */
  inactivityTimeoutMs?: number;
}

/** Thrown by `parseSSE` when the stream stalls for `inactivityTimeoutMs`. */
export class SSETimeoutError extends Error {
  constructor(message = "The stream timed out.") {
    super(message);
    this.name = "SSETimeoutError";
  }
}

function parseBlock(block: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event: ")) {
      event = line.slice("event: ".length).trim();
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice("data: ".length));
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  const raw = dataLines.join("\n");
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // keep the raw text when the payload is not JSON
  }
  return { event, data };
}

/**
 * Read a `text/event-stream` response body with the native fetch + ReadableStream
 * API and invoke `onEvent` for every complete SSE block (`event:` + `data:`).
 * No EventSource (POST bodies), no third-party SSE library.
 *
 * `options.inactivityTimeoutMs` guards against a silently hung backend: if the
 * socket produces no bytes for the configured window the underlying reader is
 * cancelled and `SSETimeoutError` is thrown. User-initiated aborts are
 * unaffected and surface as their native `AbortError`.
 */
export async function parseSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void,
  options: SSEOptions = {},
): Promise<void> {
  if (!response.body) {
    throw new Error("Response body is empty");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const timeoutMs = options.inactivityTimeoutMs;
  let buffer = "";
  let timedOut = false;

  /**
   * Read the next chunk, or reject with `SSETimeoutError` if no bytes arrive
   * within `timeoutMs`. The timer is scoped to a single read, so every chunk
   * that resolves restarts the idle window — a long-lived stream stays valid
   * as long as data keeps arriving. The reader is cancelled best-effort on
   * timeout so the underlying socket is released.
   */
  const readWithTimeout = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (timeoutMs === undefined) {
      return reader.read();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        void reader.cancel().catch(() => undefined);
        reject(new SSETimeoutError());
      }, timeoutMs);
      reader.read().then(
        (chunk) => {
          clearTimeout(timer);
          resolve(chunk);
        },
        (err) => {
          clearTimeout(timer);
          reject(timedOut ? new SSETimeoutError() : err);
        },
      );
    });
  };

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await readWithTimeout();
    } catch (err) {
      if (timedOut) {
        throw new SSETimeoutError();
      }
      throw err;
    }
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) {
        onEvent(parsed);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  // Flush any trailing block without the final blank line.
  const trailing = buffer.trim();
  if (trailing) {
    const parsed = parseBlock(trailing);
    if (parsed) {
      onEvent(parsed);
    }
  }
}
