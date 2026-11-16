// Servidor local: roda a MESMA função da Vercel (lib/app.mjs) com PostgreSQL real e arquivos em disco.
// Uso: DATABASE_URL=postgres://... npm run local   (abre em http://localhost:8890)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8890);
process.env.FILES_DRIVER ??= "local";
process.env.LOCAL_FILES_DIR ??= path.join(root, ".local-data", "files");
process.env.APP_SECRET ??= "local-dev-secret-0123456789abcdef0123456789abcdef";
process.env.NODE_ENV ??= "development";

const { handle } = await import("../lib/app.mjs");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const csp = vercel.headers[0].headers.find((h) => h.key === "Content-Security-Policy")?.value;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon",
};
const rewrite = (p) => (p === "/admin" ? "/admin.html" : p.startsWith("/pedido/") ? "/pedido.html" : p === "/" ? "/index.html" : p);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (csp) res.setHeader("content-security-policy", csp);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const hasBody = !["GET", "HEAD"].includes(req.method) && chunks.length;
      const response = await handle(new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Buffer.concat(chunks) : undefined }));
      res.statusCode = response.status;
      response.headers.forEach((v, k) => k !== "set-cookie" && res.setHeader(k, v));
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader("set-cookie", cookies);
      if (!response.body) return res.end();
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    }
    const file = path.join(root, "public", path.normalize(rewrite(decodeURIComponent(url.pathname))));
    if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("Not found");
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
