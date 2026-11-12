// Servidor local para pré-visualizar o site sem a CLI da Netlify.
// Executa a MESMA função (netlify/functions/api.mjs) e usa o servidor oficial de Netlify Blobs.
// Uso: npm run local   (abre em http://localhost:8888)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8888);
const dataDir = path.join(root, ".local-data");
fs.mkdirSync(dataDir, { recursive: true });

const token = "local-dev-token";
const blobs = new BlobsServer({ directory: path.join(dataDir, "blobs"), token });
const { port: blobsPort } = await blobs.start();
const edge = `http://127.0.0.1:${blobsPort}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({ edgeURL: edge, uncachedEdgeURL: edge, token, siteID: "local-site" }),
).toString("base64");

const { default: api } = await import("../netlify/functions/api.mjs");
const toml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const csp = toml.match(/Content-Security-Policy = "(.*)"/)?.[1];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const rewrite = (p) => {
  if (p === "/admin") return "/admin.html";
  if (p.startsWith("/pedido/")) return "/pedido.html";
  return p === "/" ? "/index.html" : p;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (csp) res.setHeader("content-security-policy", csp);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      });
      const response = await api(request, { ip: req.socket.remoteAddress || "127.0.0.1" });
      res.statusCode = response.status;
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") res.setHeader(k, v);
      });
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = path.join(root, "public", path.normalize(rewrite(decodeURIComponent(url.pathname))));
    if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(fs.readFileSync(file));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Erro interno");
  }
});

server.listen(PORT, () => console.log(`Site local: http://localhost:${PORT}  ·  Painel: http://localhost:${PORT}/admin`));
