import opentype from "opentype.js";
import { FONT_B64 } from "./font-data.mjs";

export const WATERMARK_TEXT = "Diário do Gaúcho";

let fontCache;
function font() {
  if (!fontCache) {
    const buf = Buffer.from(FONT_B64, "base64");
    fontCache = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return fontCache;
}

// Desenha o texto glifo a glifo (sem shaping avançado) com kerning; vira contornos vetoriais.
function textPath(f, text, size) {
  const scale = size / f.unitsPerEm;
  let x = 0;
  let d = "";
  let prev = null;
  for (const ch of text.normalize("NFC")) {
    const glyph = f.charToGlyph(ch);
    if (prev) x += f.getKerningValue(prev, glyph) * scale;
    d += glyph.getPath(x, 0, size).toPathData(2);
    x += (glyph.advanceWidth ?? 0) * scale;
    prev = glyph;
  }
  return { d, width: x };
}

/** SVG do tamanho exato da imagem com a marca repetida na diagonal + selo central. */
export function watermarkSvg(width, height, text = WATERMARK_TEXT) {
  const f = font();
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.055));
  const { d: glyphs, width: textWidth } = textPath(f, text, fontSize);
  const stroke = Math.max(1, fontSize * 0.045);
  const stepX = textWidth + fontSize * 2.4;
  const stepY = fontSize * 3.6;
  const diag = Math.ceil(Math.hypot(width, height));
  const cx = width / 2;
  const cy = height / 2;
  const uses = [];
  let row = 0;
  for (let y = -diag / 2; y <= diag / 2 + stepY; y += stepY, row++) {
    const offset = (row % 2) * (stepX / 2);
    for (let x = -diag / 2 - stepX + offset; x <= diag / 2 + stepX; x += stepX) {
      uses.push(`<use href="#wm" x="${(cx + x).toFixed(1)}" y="${(cy + y).toFixed(1)}"/>`);
    }
  }
  const bigSize = fontSize * 1.9;
  const { d: bigPath, width: bigWidth } = textPath(f, text, bigSize);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><path id="wm" d="${glyphs}"/></defs>
<g transform="rotate(-30 ${cx} ${cy})">
<g fill="#000" fill-opacity="0.16" transform="translate(${stroke} ${stroke})">${uses.join("")}</g>
<g fill="#fff" fill-opacity="0.34" stroke="#000" stroke-opacity="0.12" stroke-width="${stroke}">${uses.join("")}</g>
<g transform="translate(${cx - bigWidth / 2} ${cy + bigSize / 3})"><path d="${bigPath}" fill="#fff" fill-opacity="0.42" stroke="#000" stroke-opacity="0.18" stroke-width="${stroke * 1.4}"/></g>
</g></svg>`;
}
