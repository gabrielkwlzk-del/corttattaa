import "server-only";
import { UserError } from "../errors";
import { q } from "../db";
import type { AdminPhoto, EventRow, ModalityRow, PublicPhoto } from "../types";
import { assertValidPrice } from "./settings";

export const PAGE_SIZE = 24;

const PHOTO_COLUMNS = `
  p.id, p.title, p.description, p.price_cents, p.width, p.height, p.version,
  p.event_id, e.name as event_name, to_char(e.event_date, 'YYYY-MM-DD') as event_date,
  p.modality_id, m.name as modality_name, p.created_at`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}

export interface PhotoFilters {
  q?: string;
  event?: string; // slug
  modality?: string; // slug
  date?: string; // YYYY-MM-DD
  page?: number;
}

export async function listPublicPhotos(f: PhotoFilters = {}) {
  const where = ["p.status = 'ready'", "p.visibility = 'public'", "p.deleted_at is null"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("$?", `$${params.length}`));
  };
  if (f.q?.trim()) {
    add(
      "(p.title ilike $? or p.description ilike $? or e.name ilike $? or m.name ilike $?)",
      `%${f.q.trim().slice(0, 80).replace(/[%_\\]/g, (c) => "\\" + c)}%`,
    );
  }
  if (f.event) add("e.slug = $?", f.event);
  if (f.modality) add("m.slug = $?", f.modality);
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
    add("coalesce(e.event_date, (p.created_at at time zone 'America/Sao_Paulo')::date) = $?::date", f.date);
  }
  const page = Math.max(1, Math.min(500, Math.floor(f.page ?? 1)));
  params.push(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
  const rows = await q<PublicPhoto>(
    `select ${PHOTO_COLUMNS}
       from photos p
       left join events e on e.id = p.event_id
       left join modalities m on m.id = p.modality_id
      where ${where.join(" and ")}
      order by coalesce(e.event_date, p.created_at::date) desc, p.created_at desc, p.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { photos: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getPublicPhoto(id: string): Promise<PublicPhoto | null> {
  if (!isUuid(id)) return null;
  const rows = await q<PublicPhoto>(
    `select ${PHOTO_COLUMNS}
       from photos p
       left join events e on e.id = p.event_id
       left join modalities m on m.id = p.modality_id
      where p.id = $1 and p.status = 'ready' and p.visibility = 'public' and p.deleted_at is null`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listFeaturedPhotos(limit = 6): Promise<PublicPhoto[]> {
  return q<PublicPhoto>(
    `select ${PHOTO_COLUMNS}
       from photos p
       left join events e on e.id = p.event_id
       left join modalities m on m.id = p.modality_id
      where p.status = 'ready' and p.visibility = 'public' and p.deleted_at is null
        and coalesce(p.width, 0) >= coalesce(p.height, 0)
      order by p.created_at desc limit $1`,
    [limit],
  );
}

// ---------------------------------------------------------------- events --
export async function listEvents(): Promise<EventRow[]> {
  return q<EventRow>(
    `select e.id, e.name, e.slug, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.location, e.description,
            (select count(*)::int from photos p where p.event_id = e.id and p.deleted_at is null) as photo_count
       from events e order by e.event_date desc nulls last, e.name`,
  );
}

export async function listModalities(): Promise<ModalityRow[]> {
  return q<ModalityRow>(
    `select m.id, m.name, m.slug,
            (select count(*)::int from photos p where p.modality_id = m.id and p.deleted_at is null) as photo_count
       from modalities m order by m.name`,
  );
}

async function uniqueSlug(table: "events" | "modalities", base: string, excludeId?: string) {
  const slug = slugify(base);
  const rows = await q<{ slug: string }>(
    `select slug from ${table} where (slug = $1 or slug like $1 || '-%') and ($2::uuid is null or id <> $2::uuid)`,
    [slug, excludeId ?? null],
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

export interface EventInput {
  name: string;
  event_date?: string | null;
  location?: string | null;
  description?: string | null;
}

function cleanEvent(input: EventInput) {
  const name = input.name?.trim();
  if (!name || name.length > 160) throw new UserError("Informe um nome de evento (até 160 caracteres).");
  const date = input.event_date && /^\d{4}-\d{2}-\d{2}$/.test(input.event_date) ? input.event_date : null;
  return {
    name,
    date,
    location: input.location?.trim().slice(0, 160) || null,
    description: input.description?.trim().slice(0, 2000) || null,
  };
}

export async function createEvent(input: EventInput) {
  const e = cleanEvent(input);
  const slug = await uniqueSlug("events", e.name);
  const rows = await q<{ id: string }>(
    `insert into events (name, slug, event_date, location, description) values ($1,$2,$3::date,$4,$5) returning id`,
    [e.name, slug, e.date, e.location, e.description],
  );
  return rows[0].id;
}

export async function updateEvent(id: string, input: EventInput) {
  if (!isUuid(id)) throw new UserError("Evento inválido.");
  const e = cleanEvent(input);
  const slug = await uniqueSlug("events", e.name, id);
  await q(
    `update events set name=$2, slug=$3, event_date=$4::date, location=$5, description=$6 where id=$1`,
    [id, e.name, slug, e.date, e.location, e.description],
  );
}

export async function deleteEvent(id: string) {
  if (!isUuid(id)) throw new UserError("Evento inválido.");
  await q("delete from events where id = $1", [id]);
}

export async function createModality(name: string) {
  const n = name?.trim();
  if (!n || n.length > 80) throw new UserError("Informe o nome da modalidade (até 80 caracteres).");
  const slug = await uniqueSlug("modalities", n);
  const rows = await q<{ id: string }>("insert into modalities (name, slug) values ($1,$2) returning id", [n, slug]);
  return rows[0].id;
}

export async function updateModality(id: string, name: string) {
  if (!isUuid(id)) throw new UserError("Modalidade inválida.");
  const n = name?.trim();
  if (!n || n.length > 80) throw new UserError("Informe o nome da modalidade.");
  await q("update modalities set name=$2, slug=$3 where id=$1", [id, n, await uniqueSlug("modalities", n, id)]);
}

export async function deleteModality(id: string) {
  if (!isUuid(id)) throw new UserError("Modalidade inválida.");
  await q("delete from modalities where id = $1", [id]);
}

// ------------------------------------------------------------ admin photos --
export interface AdminPhotoFilters {
  q?: string;
  eventId?: string;
  modalityId?: string;
  status?: "processing" | "ready" | "failed";
  visibility?: "public" | "hidden";
  sold?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listAdminPhotos(f: AdminPhotoFilters = {}) {
  const where = ["p.deleted_at is null"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("$?", `$${params.length}`));
  };
  if (f.q?.trim()) add("(p.title ilike $? or p.original_filename ilike $?)", `%${f.q.trim().slice(0, 80)}%`);
  if (isUuid(f.eventId)) add("p.event_id = $?", f.eventId);
  if (isUuid(f.modalityId)) add("p.modality_id = $?", f.modalityId);
  if (f.status) add("p.status = $?", f.status);
  if (f.visibility) add("p.visibility = $?", f.visibility);
  if (f.sold) where.push("sold.c > 0");
  const pageSize = Math.min(200, f.pageSize ?? 60);
  const page = Math.max(1, f.page ?? 1);
  params.push(pageSize + 1, (page - 1) * pageSize);
  const rows = await q<AdminPhoto>(
    `select ${PHOTO_COLUMNS}, p.status, p.visibility, p.processing_error, p.original_filename,
            p.bytes::int as bytes, p.deleted_at, coalesce(sold.c, 0) as sold_count
       from photos p
       left join events e on e.id = p.event_id
       left join modalities m on m.id = p.modality_id
       left join lateral (
         select count(*)::int c from order_items oi join orders o on o.id = oi.order_id
          where oi.photo_id = p.id and o.status = 'paid') sold on true
      where ${where.join(" and ")}
      order by p.created_at desc, p.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { photos: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

export interface PhotoPatch {
  title?: string;
  description?: string;
  price_cents?: number;
  event_id?: string | null;
  modality_id?: string | null;
  visibility?: "public" | "hidden";
}

export async function updatePhotos(ids: string[], patch: PhotoPatch) {
  const valid = ids.filter(isUuid);
  if (!valid.length) throw new UserError("Nenhuma fotografia selecionada.");
  if (valid.length > 1000) throw new UserError("Selecione no máximo 1000 fotografias.");
  const sets: string[] = [];
  const params: unknown[] = [valid];
  const set = (col: string, v: unknown, cast = "") => {
    params.push(v);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  if (patch.title !== undefined) set("title", String(patch.title).trim().slice(0, 160));
  if (patch.description !== undefined) set("description", String(patch.description).trim().slice(0, 2000));
  if (patch.price_cents !== undefined) {
    assertValidPrice(patch.price_cents);
    set("price_cents", patch.price_cents);
  }
  if (patch.event_id !== undefined) set("event_id", isUuid(patch.event_id) ? patch.event_id : null, "::uuid");
  if (patch.modality_id !== undefined)
    set("modality_id", isUuid(patch.modality_id) ? patch.modality_id : null, "::uuid");
  if (patch.visibility !== undefined) {
    if (patch.visibility !== "public" && patch.visibility !== "hidden") throw new UserError("Visibilidade inválida.");
    set("visibility", patch.visibility);
  }
  if (!sets.length) return 0;
  const rows = await q(
    `update photos set ${sets.join(", ")}, updated_at = now() where id = any($1::uuid[]) and deleted_at is null returning id`,
    params,
  );
  return rows.length;
}
