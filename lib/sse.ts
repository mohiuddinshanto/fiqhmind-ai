export interface SSEEvent {
  event: string;
  data: unknown;
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
 */
export async function parseSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("Response body is empty");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

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
