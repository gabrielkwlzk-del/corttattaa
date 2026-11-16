import { files } from "./files.mjs";
import { HttpError, slug } from "./http.mjs";
import { ImageError, processImage } from "./images.mjs";
import { getPhoto, upsertPhoto } from "./repo.mjs";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic", "image/heif", "image/avif"];

export function safeFilename(name) {
  const m = String(name ?? "").match(/\.([a-z0-9]{2,5})$/i);
  const ext = (m?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");
  const base = String(name ?? "foto").replace(/\.[a-z0-9]{2,5}$/i, "");
  return `${slug(base)}.${ext}`;
}

/**
 * Valida o arquivo pelo conteúdo, gera prévia/miniatura (com marca d'água gravada nos pixels) e o fundo borrado,
 * grava tudo e registra a foto no banco. O original já está (ou é gravado) no armazenamento privado.
 */
export async function ingest({ id, buffer, originalPath, filename, title, description, modalidade, evento, priceCents, hidden, deleted, createdAt }) {
  let img;
  try {
    img = await processImage(buffer);
  } catch (e) {
    if (e instanceof ImageError) throw new HttpError(400, `${filename || "Arquivo"}: ${e.message}`);
    throw e;
  }
  const f = files();
  const prev = await getPhoto(id);
  const v = (prev?.v ?? 0) + 1;
  const paths = {
    preview: `derived/${id}/preview-v${v}.webp`,
    thumb: `derived/${id}/thumb-v${v}.webp`,
    hero: `derived/${id}/hero-v${v}.webp`,
  };
  await Promise.all([
    f.put(paths.preview, img.preview, "image/webp"),
    f.put(paths.thumb, img.thumb, "image/webp"),
    f.put(paths.hero, img.hero, "image/webp"),
  ]);
  await upsertPhoto({
    id,
    title: String(title ?? "").slice(0, 160),
    description: String(description ?? "").slice(0, 2000),
    modalidade: String(modalidade ?? "").slice(0, 60),
    evento: String(evento ?? "").slice(0, 120),
    priceCents,
    width: img.width,
    height: img.height,
    format: img.format,
    mime: img.mime,
    bytes: buffer.length,
    originalFilename: filename ?? null,
    originalPath,
    previewPath: paths.preview,
    thumbPath: paths.thumb,
    heroPath: paths.hero,
    hidden: hidden ?? false,
    deleted: deleted ?? false,
    v,
    createdAt: createdAt ?? new Date(),
  });
  return getPhoto(id);
}
