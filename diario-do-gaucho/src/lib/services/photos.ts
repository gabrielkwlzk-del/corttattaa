import "server-only";
import { UserError } from "../errors";
import crypto from "node:crypto";
import { q } from "../db";
import { env } from "../env";
import { hmac, safeEqual } from "../crypto";
import { ImageValidationError, extensionFor, processImage } from "../images";
import { storage, type UploadTarget } from "../storage";
import { isUuid } from "./catalog";
import { assertValidPrice, getDefaultPriceCents } from "./settings";

export const MAX_FILES_PER_BATCH = 500;
const TICKET_TTL_SECONDS = 2 * 3600;

export interface UploadRequestFile {
  name: string;
  size: number;
  type: string;
}

export interface PreparedUpload {
  photoId: string;
  key: string;
  exp: number;
  ticket: string;
  upload: UploadTarget;
}

function ticketFor(photoId: string, key: string, exp: number) {
  return hmac(`upload-ticket:${photoId}:${key}:${exp}`);
}

/** Etapa 1: valida metadados declarados e gera URLs de upload direto para o armazenamento privado. */
export async function prepareUploads(files: UploadRequestFile[]): Promise<PreparedUpload[]> {
  if (!Array.isArray(files) || files.length === 0) throw new UserError("Nenhum arquivo enviado.");
  if (files.length > MAX_FILES_PER_BATCH) throw new UserError(`Máximo de ${MAX_FILES_PER_BATCH} arquivos por lote.`);
  const max = env.maxUploadBytes;
  const now = new Date();
  const out: PreparedUpload[] = [];
  for (const f of files) {
    if (!f || typeof f.name !== "string" || typeof f.size !== "number") throw new UserError("Arquivo inválido.");
    if (f.size <= 0 || f.size > max) {
      throw new UserError(`"${f.name}" excede o limite de ${Math.round(max / 1024 / 1024)} MB.`);
    }
    if (f.type && !/^image\/(jpeg|png|webp|tiff|heif|avif)$/.test(f.type)) {
      throw new UserError(`"${f.name}" não é um formato de imagem aceito.`);
    }
    const photoId = crypto.randomUUID();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${photoId}`;
    const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
    out.push({
      photoId,
      key,
      exp,
      ticket: ticketFor(photoId, key, exp),
      upload: await storage().createUploadTarget(key, f.type || "application/octet-stream"),
    });
  }
  return out;
}

export interface FinalizeInput {
  photoId: string;
  key: string;
  exp: number;
  ticket: string;
  filename?: string;
  title?: string;
  eventId?: string | null;
  modalityId?: string | null;
  priceCents?: number | null;
}

function titleFromFilename(name?: string) {
  if (!name) return "";
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Etapa 2: registra a fotografia enviada (status "processing"). O processamento ocorre em segundo plano. */
export async function finalizeUpload(input: FinalizeInput): Promise<string> {
  const { photoId, key, exp, ticket } = input;
  if (!isUuid(photoId) || typeof key !== "string" || !key.endsWith(photoId)) throw new UserError("Upload inválido.");
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) throw new UserError("Upload expirado.");
  if (typeof ticket !== "string" || !safeEqual(ticketFor(photoId, key, exp), ticket)) {
    throw new UserError("Assinatura de upload inválida.");
  }
  const price = input.priceCents ?? (await getDefaultPriceCents());
  assertValidPrice(price);
  await q(
    `insert into photos (id, original_path, price_cents, title, event_id, modality_id, original_filename, status)
     values ($1, $2, $3, $4, $5::uuid, $6::uuid, $7, 'processing')
     on conflict (id) do nothing`,
    [
      photoId,
      key,
      price,
      (input.title?.trim() || titleFromFilename(input.filename)).slice(0, 160),
      isUuid(input.eventId) ? input.eventId : null,
      isUuid(input.modalityId) ? input.modalityId : null,
      input.filename?.slice(0, 255) ?? null,
    ],
  );
  return photoId;
}

export function previewKey(id: string, version: number, variant: "preview" | "thumb") {
  return `${variant}/${id}/v${version}.webp`;
}

/**
 * Processa uma foto: valida o arquivo real, gera prévia + miniatura com marca
 * d'água gravada nos pixels e grava no armazenamento de prévias.
 * O original permanece intocado no armazenamento privado.
 */
export async function processPhoto(id: string): Promise<"ready" | "failed" | "skipped"> {
  const rows = await q<{ id: string; original_path: string; version: number; status: string }>(
    "select id, original_path, version, status from photos where id = $1",
    [id],
  );
  const photo = rows[0];
  if (!photo || photo.status !== "processing") return "skipped";
  const s = storage();
  try {
    const original = await s.get("originals", photo.original_path);
    if (original.length > env.maxUploadBytes) throw new ImageValidationError("Arquivo excede o limite de tamanho.");
    const img = await processImage(original);
    await s.put("previews", previewKey(id, photo.version, "preview"), img.preview, "image/webp");
    await s.put("previews", previewKey(id, photo.version, "thumb"), img.thumb, "image/webp");
    await q(
      `update photos set status='ready', width=$2, height=$3, bytes=$4, mime=$5,
              preview_path=$6, thumb_path=$7, processing_error=null, updated_at=now()
        where id=$1`,
      [
        id,
        img.width,
        img.height,
        original.length,
        img.mime,
        previewKey(id, photo.version, "preview"),
        previewKey(id, photo.version, "thumb"),
      ],
    );
    return "ready";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (err instanceof ImageValidationError) {
      // Arquivo inválido: descartamos o original para não acumular lixo.
      await s.remove("originals", [photo.original_path]).catch(() => {});
    }
    await q("update photos set status='failed', processing_error=$2, updated_at=now() where id=$1", [
      id,
      message.slice(0, 500),
    ]);
    return "failed";
  }
}

/** Processa itens pendentes (ex.: após reinício do servidor). */
export async function processPending(limit = 10, olderThanSeconds = 120) {
  const rows = await q<{ id: string }>(
    `select id from photos where status='processing' and deleted_at is null
       and updated_at < now() - ($2::int * interval '1 second') order by created_at limit $1`,
    [limit, olderThanSeconds],
  );
  for (const r of rows) await processPhoto(r.id);
  return rows.length;
}

export async function reprocessPhoto(id: string) {
  if (!isUuid(id)) throw new UserError("Foto inválida.");
  await q(
    "update photos set status='processing', version=version+1, processing_error=null, updated_at=now() where id=$1 and deleted_at is null",
    [id],
  );
  return processPhoto(id);
}

/**
 * Exclusão: se a foto já participa de algum pedido, ela é apenas arquivada
 * (o original continua disponível para quem comprou). Caso contrário é apagada.
 */
export async function deletePhotos(ids: string[]) {
  const valid = ids.filter(isUuid);
  let archived = 0;
  let removed = 0;
  for (const id of valid) {
    const rows = await q<{ original_path: string; preview_path: string | null; thumb_path: string | null; used: boolean }>(
      `select original_path, preview_path, thumb_path,
              exists(select 1 from order_items oi where oi.photo_id = p.id) as used
         from photos p where id = $1 and deleted_at is null`,
      [id],
    );
    const p = rows[0];
    if (!p) continue;
    if (p.used) {
      await q("update photos set deleted_at=now(), visibility='hidden', updated_at=now() where id=$1", [id]);
      archived++;
    } else {
      await q("delete from photos where id=$1", [id]);
      const s = storage();
      await s.remove("originals", [p.original_path]).catch(() => {});
      await s.remove("previews", [p.preview_path, p.thumb_path].filter(Boolean) as string[]).catch(() => {});
      removed++;
    }
  }
  return { archived, removed };
}

/** Lê a prévia com marca d'água. Fotos ocultas só são servidas ao administrador. */
export async function readPreview(id: string, variant: "preview" | "thumb", isAdmin: boolean) {
  if (!isUuid(id)) return null;
  const rows = await q<{ preview_path: string | null; thumb_path: string | null; visibility: string; deleted_at: string | null; status: string }>(
    "select preview_path, thumb_path, visibility, deleted_at, status from photos where id=$1",
    [id],
  );
  const p = rows[0];
  if (!p || p.status !== "ready") return null;
  if (!isAdmin && (p.visibility !== "public" || p.deleted_at)) return null;
  const key = variant === "thumb" ? p.thumb_path : p.preview_path;
  if (!key) return null;
  return storage().get("previews", key);
}

export function downloadFilename(title: string, code: string, mime: string | null) {
  const ext = extensionFor((mime ?? "image/jpeg").split("/")[1] ?? "jpg");
  const base = (title || "foto")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "foto";
  return `diario-do-gaucho-${base}-${code}.${ext}`;
}
