// Gera os arquivos de semente a partir das fotos originais:
//  - public/p/<id>.webp e <id>-t.webp (prévia e miniatura COM marca d'água)
//  - netlify/lib/seed-data.mjs (originais embutidos no servidor, nunca públicos)
//  - netlify/lib/font-data.mjs (fonte da marca d'água)
// Uso: node tools/make-seed.mjs <pasta-com-1.webp..8.webp>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) throw new Error("Informe a pasta com as fotos.");

const fontFile = path.join(root, "tools", "Inter-Bold.woff");
fs.mkdirSync(path.join(root, "netlify/lib"), { recursive: true });
fs.writeFileSync(
  path.join(root, "netlify/lib/font-data.mjs"),
  `export const FONT_B64 = "${fs.readFileSync(fontFile).toString("base64")}";\n`,
);

const META = [
  { file: "1.webp", title: "Chegada com os braços erguidos", modalidade: "Corrida" },
  { file: "2.webp", title: "Largada com o pelotão", modalidade: "Corrida" },
  { file: "3.webp", title: "Hidratação no posto", modalidade: "Corrida" },
  { file: "4.webp", title: "Pelotão em curva de serra", modalidade: "Ciclismo" },
  { file: "5.webp", title: "Fuga ao pôr do sol", modalidade: "Ciclismo" },
  { file: "6.webp", title: "Lance de gol", modalidade: "Futebol" },
  { file: "7.webp", title: "Tênis após a prova", modalidade: "Corrida" },
  { file: "8.webp", title: "Medalha de finisher", modalidade: "Corrida" },
];

const { processImage } = await import("../netlify/lib/images.mjs");
const out = [];
for (const [i, m] of META.entries()) {
  const id = `seed-${i + 1}`;
  const buf = fs.readFileSync(path.join(src, m.file));
  const img = await processImage(buf);
  fs.writeFileSync(path.join(root, "public/p", `${id}.webp`), img.preview);
  fs.writeFileSync(path.join(root, "public/p", `${id}-t.webp`), img.thumb);
  out.push({ id, title: m.title, modalidade: m.modalidade, width: img.width, height: img.height, format: img.format, mime: img.mime, b64: buf.toString("base64") });
  console.log(id, img.width + "x" + img.height, (buf.length / 1024).toFixed(0) + "KB");
}
fs.writeFileSync(path.join(root, "netlify/lib/seed-data.mjs"), `export const SEED = ${JSON.stringify(out)};\n`);
