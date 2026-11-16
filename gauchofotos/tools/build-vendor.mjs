// Empacota a biblioteca de envio direto do Vercel Blob para o navegador (sem CDN externa; compatível com a CSP).
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/js/vendor");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, ".entry.mjs"), 'export { upload } from "@vercel/blob/client";\n');
await build({
  entryPoints: [path.join(out, ".entry.mjs")],
  outfile: path.join(out, "blob-client.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  absWorkingDir: root,
});
fs.rmSync(path.join(out, ".entry.mjs"));
console.log("vendor: blob-client.js", (fs.statSync(path.join(out, "blob-client.js")).size / 1024).toFixed(0) + " KB");
