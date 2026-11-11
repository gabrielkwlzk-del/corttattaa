import opentype from "opentype.js";
import { FONT_B64 } from "./font-data.mjs";

export const WATERMARK_TEXT = "ESPORTE SHOW ONLINE";

let fontCache;
function font() {
  if (!fontCache) {
    const buf = Buffer.from(FONT_B64, "base64");
    fontCache = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return fontCache;
}

// Texto glifo a glifo (sem shaping avançado), com kerning e espaçamento entre letras.
// Vira contornos vetoriais, então não depende de fontes instaladas no servidor.
function glyphs(f, text, size, tracking) {
  const scale = size / f.unitsPerEm;
  let x = 0;
  let d = "";
  let prev = null;
  for (const ch of text.normalize("NFC")) {
    const g = f.charToGlyph(ch);
    if (prev) x += f.getKerningValue(prev, g) * scale + size * tracking;
    d += g.getPath(x, 0, size).toPathData(2);
    x += (g.advanceWidth ?? 0) * scale;
    prev = g;
  }
  return { d, width: x };
}

// Marca = ícone (lente com cantos de câmera) + nome. Devolve as definições SVG e a largura.
function mark(f, id, size) {
  const { d, width } = glyphs(f, WATERMARK_TEXT, size, 0.14);
  const icon = size * 1.45;
  const gap = size * 0.55;
  const cap = size * 0.73;
  const defs =
    `<path id="${id}t" stroke="none" transform="translate(${(icon + gap).toFixed(2)} 0)" d="${d}"/>` +
    `<g id="${id}i" fill="none" stroke-width="2.2" stroke-linecap="round" transform="translate(0 ${(-(cap / 2 + icon / 2)).toFixed(2)}) scale(${(icon / 24).toFixed(4)})">` +
    `<circle cx="12" cy="12" r="4.2"/><path d="M4 8.5V7a3 3 0 0 1 3-3h1.5M20 8.5V7a3 3 0 0 0-3-3h-1.5M4 15.5V17a3 3 0 0 0 3 3h1.5M20 15.5V17a3 3 0 0 1-3 3h-1.5"/></g>`;
  return { defs, width: icon + gap + width, cap };
}

const useMark = (id, x, y) =>
  `<use href="#${id}t" x="${x.toFixed(1)}" y="${y.toFixed(1)}"/><use href="#${id}i" x="${x.toFixed(1)}" y="${y.toFixed(1)}"/>`;
const layer = (color, opacity, inner, shift = 0) =>
  `<g fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-opacity="${opacity}"${shift ? ` transform="translate(${shift} ${shift})"` : ""}>${inner}</g>`;

/**
 * SVG do tamanho exato da imagem com a marca "ESPORTE SHOW ONLINE":
 *  - padrão diagonal repetido por toda a foto (impede recortes);
 *  - selo grande no centro;
 *  - etiqueta no canto inferior direito.
 * É rasterizado e fundido aos pixels pelo Sharp — não é CSS.
 */
export function watermarkSvg(width, height) {
  const f = font();
  const short = Math.min(width, height);
  const tileSize = Math.max(12, Math.round(short * 0.038));
  const tile = mark(f, "a", tileSize);
  const big = mark(f, "b", Math.max(20, short * 0.07));
  const pillSize = Math.max(11, short * 0.026);
  const pill = mark(f, "c", pillSize);

  const stepX = tile.width + tileSize * 3.2;
  const stepY = tileSize * 5.4;
  const diag = Math.ceil(Math.hypot(width, height));
  const cx = width / 2;
  const cy = height / 2;
  const tiles = [];
  let row = 0;
  for (let y = -diag / 2; y <= diag / 2 + stepY; y += stepY, row++) {
    const offset = (row % 2) * (stepX / 2);
    for (let x = -diag / 2 - stepX + offset; x <= diag / 2 + stepX; x += stepX) tiles.push(useMark("a", cx + x, cy + y));
  }
  const tileUses = tiles.join("");
  const bigX = cx - big.width / 2;
  const bigY = cy + big.cap / 2;
  const bigUse = useMark("b", bigX, bigY);

  const padX = pillSize * 1.1;
  const pillH = pillSize * 2.6;
  const pillW = pill.width + padX * 2;
  const margin = Math.max(10, short * 0.035);
  const pillX = width - margin - pillW;
  const pillY = height - margin - pillH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${tile.defs}${big.defs}${pill.defs}</defs>
<g transform="rotate(-28 ${cx} ${cy})">
${layer("#000", 0.2, tileUses, Math.max(1, tileSize * 0.06))}
${layer("#fff", 0.4, tileUses)}
${layer("#000", 0.26, bigUse, Math.max(1.5, big.cap * 0.05))}
${layer("#fff", 0.58, bigUse)}
</g>
<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="#08090d" fill-opacity="0.58"/>
<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity="0.22"/>
${layer("#fff", 0.95, useMark("c", pillX + padX, pillY + pillH / 2 + pill.cap / 2))}
</svg>`;
}
