import { watermarkSvg } from "./watermark.mjs";

export const ALLOWED = new Set(["jpeg", "png", "webp", "tiff", "heif", "avif"]);
export const MAX_PIXELS = 120_000_000;
export class ImageError extends Error {}

const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", tiff: "image/tiff", heif: "image/heif", avif: "image/avif" };
export const extFor = (format) => (format === "jpeg" ? "jpg" : format);

async function render(sharp, input, maxSide, quality) {
  const resized = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  return sharp(resized.data)
    .composite([{ input: Buffer.from(watermarkSvg(width, height)), top: 0, left: 0 }])
    .webp({ quality, effort: 4 })
    .toBuffer();
}

/** Valida o conteúdo real e gera prévia (1600px) e miniatura (720px) com marca d'água gravada nos pixels. */
export async function processImage(buffer) {
  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageError("Arquivo não é uma imagem válida.");
  }
  const format = meta.format ?? "";
  if (!ALLOWED.has(format)) throw new ImageError(`Formato não suportado (${format || "desconhecido"}). Use JPEG, PNG, WebP ou TIFF.`);
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (width < 200 || height < 200) throw new ImageError("Imagem muito pequena (mínimo 200px).");
  const [preview, thumb] = await Promise.all([render(sharp, buffer, 1600, 80), render(sharp, buffer, 720, 74)]);
  return { width, height, format, mime: MIME[format], preview, thumb };
}
