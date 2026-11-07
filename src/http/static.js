import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { notFound } from "./httpErrors.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const missing = () => notFound("File not found");

export function safeSegments(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;

  const segments = decoded.split("/").filter((s) => s !== "");
  if (segments.some((s) => s.startsWith("."))) return null;
  return segments;
}

const isInside = (root, target) => target.startsWith(root + path.sep);

export function createStaticServer(publicDir) {
  let root = null;

  return async function serveStatic(req, res, pathname) {
    const segments = safeSegments(pathname);
    if (!segments) throw missing();

    try {
      root ??= await realpath(publicDir);
    } catch {
      throw missing();
    }

    let file;
    let info;
    try {
      file = await realpath(path.join(root, ...segments));
      if (file !== root && !isInside(root, file)) throw missing();
      info = await stat(file);
      if (info.isDirectory()) {
        file = await realpath(path.join(file, "index.html"));
        if (!isInside(root, file)) throw missing();
        info = await stat(file);
      }
    } catch {
      throw missing();
    }
    if (!info.isFile()) throw missing();

    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    try {
      await pipeline(createReadStream(file), res);
    } catch {
      res.destroy();
    }
  };
}
