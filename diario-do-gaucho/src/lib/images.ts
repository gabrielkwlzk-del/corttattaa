import "server-only";
import sharp from "sharp";
import { watermarkSvg } from "./watermark";

sharp.cache(false);
sharp.concurrency(Math.max(1, Number(process.env.SHARP_CONCURRENCY ?? 2)));

export const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "tiff", "heif", "avif"]);
export const MAX_PIXELS = 150_000_000; // ~150 MP
export const MIN_DIMENSION = 200;

export const PREVIEW_MAX = 1600;
export const THUMB_MAX = 720;

export class ImageValidationError extends Error {}

export interface ProcessedImage {
  width: number;
  height: number;
  format: string;
  mime: string;
  preview: Buffer;
  thumb: Buffer;
}

const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tiff: "image/tiff",
  heif: "image/heif",
  avif: "image/avif",
};

/**
 * Valida o arquivo pelo conteúdo real (não pela extensão/MIME enviados) e gera:
 *  - prévia (máx. 1600px) com marca d'água gravada nos pixels;
 *  - miniatura (máx. 720px) também com marca d'água.
 * Metadados (EXIF/GPS) são removidos das versões públicas.
 */
export async function processImage(original: Buffer): Promise<ProcessedImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(original, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageValidationError("Arquivo não é uma imagem válida.");
  }
  const format = meta.format ?? "";
  if (!ALLOWED_FORMATS.has(format)) {
    throw new ImageValidationError(`Formato não suportado (${format || "desconhecido"}). Use JPEG, PNG, WebP ou TIFF.`);
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new ImageValidationError(`Imagem muito pequena (${width}×${height}). Mínimo ${MIN_DIMENSION}px.`);
  }

  const [preview, thumb] = await Promise.all([
    renderWatermarked(original, PREVIEW_MAX, 80),
    renderWatermarked(original, THUMB_MAX, 74),
  ]);
  return { width, height, format, mime: MIME[format] ?? "application/octet-stream", preview, thumb };
}

async function renderWatermarked(original: Buffer, maxSide: number, quality: number): Promise<Buffer> {
  const resized = await sharp(original, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const svg = Buffer.from(watermarkSvg(width, height));
  return sharp(resized.data)
    .composite([{ input: svg, top: 0, left: 0 }])
    .webp({ quality, effort: 4 })
    .toBuffer();
}

export function extensionFor(format: string): string {
  return format === "jpeg" ? "jpg" : format;
}
