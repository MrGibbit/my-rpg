import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function parsePort(argv) {
  const idx = argv.findIndex((a) => a === "--port" || a === "-p");
  if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]) || 8000;
  const envPort = Number(process.env.PORT || "");
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 8000;
}

const port = parsePort(process.argv.slice(2));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8"
};

function safeJoin(base, targetPath) {
  const normalized = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  return path.join(base, normalized);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const reqPath = decodeURIComponent(url.pathname);
    const filePath = reqPath === "/" ? "index.html" : reqPath.slice(1);
    const absPath = safeJoin(root, filePath);

    if (!absPath.startsWith(root)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.stat(absPath, (statErr, stats) => {
      if (statErr || !stats || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(absPath).toLowerCase();
      const contentType = MIME[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      });
      fs.createReadStream(absPath).pipe(res);
    });
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`classic-rpg dev server: http://127.0.0.1:${port}\n`);
});
