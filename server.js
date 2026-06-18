"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8080);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": status === 200 ? "public, max-age=60" : "no-store"
  });
  res.end(body);
}

function resolvePublicFile(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  const cleanPath = decodeURIComponent(parsed.pathname);
  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const fullPath = path.normalize(path.join(rootDir, requestedPath));

  if (!fullPath.startsWith(rootDir)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  if (!req.url || req.method !== "GET") {
    send(res, 405, "Metodo nao permitido");
    return;
  }

  if (req.url.startsWith("/health")) {
    send(res, 200, JSON.stringify({ ok: true, game: "tatico-3d" }), "application/json; charset=utf-8");
    return;
  }

  const filePath = resolvePublicFile(req.url);
  if (!filePath) {
    send(res, 403, "Caminho bloqueado");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Arquivo nao encontrado");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, data, type);
  });
});

server.listen(port, () => {
  console.log(`Tatico 3D rodando em http://localhost:${port}`);
});
