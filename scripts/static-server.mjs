import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const MAX_PORT_RETRIES = 20;

function parsePort(argv) {
  const idx = argv.findIndex((a) => a === "--port" || a === "-p");
  if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]) || 8000;
  const envPort = Number(process.env.PORT || "");
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 8000;
}

const basePort = parsePort(process.argv.slice(2));

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

let activePort = basePort;
let retryCount = 0;

function startServer(port) {
  activePort = port;
  server.removeAllListeners("listening");
  server.once("listening", () => {
    if (retryCount > 0) {
      process.stdout.write(
        `Port ${basePort} was busy; running on http://${HOST}:${activePort} instead\n`
      );
      return;
    }
    process.stdout.write(`classic-rpg dev server: http://${HOST}:${activePort}\n`);
  });
  server.listen(port, HOST);
}

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE" && retryCount < MAX_PORT_RETRIES) {
    retryCount += 1;
    startServer(basePort + retryCount);
    return;
  }

  if (err && err.code === "EADDRINUSE") {
    process.stderr.write(
      `Unable to start dev server: ports ${basePort}-${basePort + MAX_PORT_RETRIES} are in use.\n`
    );
    process.exit(1);
    return;
  }

  process.stderr.write(`Dev server failed to start: ${err?.message || String(err)}\n`);
  process.exit(1);
});

startServer(basePort);
