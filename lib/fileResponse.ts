import fs from "node:fs";
import { Readable } from "node:stream";

/**
 * A file as an HTTP response, honouring a Range request. A video element asks
 * for ranges to seek, and Safari refuses to play from a server that cannot
 * answer one.
 */
export function fileResponse(
  req: Request,
  filePath: string,
  size: number,
  contentType: string,
  headers: Record<string, string> = {},
) {
  const range = req.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(
      fs.createReadStream(filePath),
    ) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0;
  let end = size - 1;
  if (match) {
    if (match[1]) start = parseInt(match[1], 10);
    if (match[2]) end = parseInt(match[2], 10);
  }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as ReadableStream;

  return new Response(stream, {
    status: 206,
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
