import { open } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

export function parseByteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || size === 0) return "invalid";
  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return "invalid";
  if (!startValue) {
    const length = Number(endValue);
    if (!Number.isSafeInteger(length) || length <= 0) return "invalid";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(startValue);
  const end = endValue ? Number(endValue) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end < start ||
    start >= size
  )
    return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

export async function recordingFileResponse(
  request: Pick<Request, "method" | "headers" | "signal">,
  path: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const file = await open(path, "r");
  let streaming = false;
  try {
    const { size } = await file.stat();
    const range =
      request.method === "HEAD"
        ? null
        : parseByteRange(request.headers.get("range"), size);
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Content-Type":
        extname(path).toLowerCase() === ".mp4"
          ? "video/mp4"
          : "video/iso.segment",
    });
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const status = range ? 206 : 200;
    headers.set(
      "Content-Length",
      String(range ? range.end - range.start + 1 : size),
    );
    if (range)
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    if (request.method === "HEAD" || size === 0)
      return new Response(null, { status, headers });
    const body = Readable.toWeb(
      file.createReadStream({ ...range, signal: request.signal }),
      {
        strategy: {
          highWaterMark: 64 * 1024,
          size: (chunk: Uint8Array) => chunk.byteLength,
        },
      },
    );
    const response = new Response(body as ReadableStream<Uint8Array>, {
      status,
      headers,
    });
    streaming = true; // The stream owns the descriptor until completion or cancellation.
    return response;
  } finally {
    if (!streaming) await file.close();
  }
}
