import { getSetting, withDb } from "./db.mjs";
import { isUuid } from "./http.mjs";

export const DEFAULT_PRICE_CENTS = 900;
export async function defaultPriceCents() {
  const v = await getSetting("default_price_cents");
  return Number.isInteger(v) ? v : DEFAULT_PRICE_CENTS;
}

// ------------------------------------------------------------------ fotos ----
export const publicPhotos = () =>
  withDb(
    (s) => s`select id, title, description, modalidade, evento, price_cents, width, height, v
               from photos where not hidden and not deleted and preview_path is not null
              order by created_at desc, id limit 1000`,
  );

export const adminPhotos = () =>
  withDb(
    (s) => s`select id, title, description, modalidade, evento, price_cents, width, height, v, hidden, created_at, original_filename
               from photos where not deleted order by created_at desc, id limit 2000`,
  );

export async function getPhoto(id) {
  if (!isUuid(id)) return null;
  const rows = await withDb((s) => s`select * from photos where id = ${id}`);
  return rows[0] ?? null;
}

export async function upsertPhoto(p) {
  await withDb(
    (s) => s`insert into photos (id, title, description, modalidade, evento, price_cents, width, height, format, mime, bytes,
                                 original_filename, original_path, preview_path, thumb_path, hero_path, hidden, deleted, v, created_at)
             values (${p.id}, ${p.title}, ${p.description ?? ""}, ${p.modalidade ?? ""}, ${p.evento ?? ""}, ${p.priceCents},
                     ${p.width ?? null}, ${p.height ?? null}, ${p.format ?? null}, ${p.mime ?? null}, ${p.bytes ?? null},
                     ${p.originalFilename ?? null}, ${p.originalPath ?? null}, ${p.previewPath ?? null}, ${p.thumbPath ?? null},
                     ${p.heroPath ?? null}, ${p.hidden ?? false}, ${p.deleted ?? false}, ${p.v ?? 1}, ${p.createdAt ?? new Date()})
             on conflict (id) do update set
               title = excluded.title, description = excluded.description, modalidade = excluded.modalidade, evento = excluded.evento,
               price_cents = excluded.price_cents, width = excluded.width, height = excluded.height, format = excluded.format,
               mime = excluded.mime, bytes = excluded.bytes, original_filename = excluded.original_filename,
               original_path = excluded.original_path, preview_path = excluded.preview_path, thumb_path = excluded.thumb_path,
               hero_path = excluded.hero_path, hidden = excluded.hidden, deleted = excluded.deleted, v = excluded.v,
               created_at = excluded.created_at`,
  );
}

export async function updatePhoto(id, patch) {
  const cur = await getPhoto(id);
  if (!cur || cur.deleted) return null;
  const n = {
    title: patch.title ?? cur.title,
    description: patch.description ?? cur.description,
    modalidade: patch.modalidade ?? cur.modalidade,
    evento: patch.evento ?? cur.evento,
    price: patch.priceCents ?? cur.price_cents,
    hidden: patch.hidden ?? cur.hidden,
  };
  await withDb(
    (s) => s`update photos set title = ${n.title}, description = ${n.description}, modalidade = ${n.modalidade},
                              evento = ${n.evento}, price_cents = ${n.price}, hidden = ${n.hidden} where id = ${id}`,
  );
  return getPhoto(id);
}

export async function photoSold(id) {
  const r = await withDb((s) => s`select 1 from order_items where photo_id = ${id} limit 1`);
  return r.length > 0;
}

export async function archivePhoto(id) {
  await withDb((s) => s`update photos set deleted = true, hidden = true where id = ${id}`);
}

export async function removePhoto(id) {
  await withDb((s) => s`delete from photos where id = ${id}`);
}

// ---------------------------------------------------------------- pedidos ----
export async function createOrder(o) {
  await withDb((s) =>
    s.begin(async (t) => {
      await t`insert into orders (id, code, status, amount_cents, email, name, pix)
              values (${o.id}, ${o.code}, 'pending', ${o.amountCents}, ${o.email}, ${o.name}, ${o.pix})`;
      for (const i of o.items) {
        await t`insert into order_items (order_id, photo_id, title, price_cents) values (${o.id}, ${i.photoId}, ${i.title}, ${i.priceCents})`;
      }
    }),
  );
}

export async function availablePhotos(ids) {
  return withDb(
    (s) => s`select id, title, price_cents from photos
              where id in ${s(ids)} and not hidden and not deleted and preview_path is not null`,
  );
}

export async function orderById(id) {
  const rows = await withDb((s) => s`select * from orders where id = ${id}`);
  const order = rows[0];
  if (!order) return null;
  order.items = await withDb(
    (s) => s`select i.photo_id, i.title, i.price_cents, i.downloads, p.v
               from order_items i join photos p on p.id = i.photo_id where i.order_id = ${id} order by i.id`,
  );
  return order;
}

export async function setReported(id) {
  await withDb((s) => s`update orders set reported_at = coalesce(reported_at, now()) where id = ${id} and status = 'pending'`);
}

/** Confirma o pagamento de forma atômica: dois cliques ao mesmo tempo não duplicam nada. */
export async function confirmOrder(id) {
  const rows = await withDb(
    (s) => s`update orders set status = 'paid', paid_at = now(), confirmed_by = 'admin' where id = ${id} and status = 'pending' returning id`,
  );
  return rows.length > 0;
}

export async function cancelOrder(id) {
  await withDb((s) => s`update orders set status = 'cancelled' where id = ${id} and status = 'pending'`);
}

export const listOrders = () =>
  withDb(
    (s) => s`select o.id, o.code, o.status, o.amount_cents, o.email, o.name, o.created_at, o.reported_at, o.paid_at,
                    coalesce(string_agg(i.title, ', ' order by i.id), '') as titles
               from orders o left join order_items i on i.order_id = o.id
              group by o.id
              order by case when o.status = 'pending' and o.reported_at is not null then 0
                            when o.status = 'pending' then 1 else 2 end, o.created_at desc
              limit 1000`,
  );

export async function orderStats() {
  const [r] = await withDb(
    (s) => s`select coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::bigint as revenue,
                    count(*) filter (where status = 'paid')::int as paid,
                    count(*) filter (where status = 'pending')::int as pending,
                    count(*) filter (where status = 'pending' and reported_at is not null)::int as review
               from orders`,
  );
  return { revenueCents: Number(r.revenue), paid: r.paid, pending: r.pending, awaitingReview: r.review };
}

/** Conta o download de forma atômica, respeitando o limite por item. */
export async function takeDownload(orderId, photoId, max) {
  const r = await withDb(
    (s) => s`update order_items set downloads = downloads + 1
              where order_id = ${orderId} and photo_id = ${photoId} and downloads < ${max} returning downloads`,
  );
  return r.length > 0;
}

export async function giveBackDownload(orderId, photoId) {
  await withDb((s) => s`update order_items set downloads = greatest(downloads - 1, 0) where order_id = ${orderId} and photo_id = ${photoId}`);
}

export async function thumbIsReferenced(id) {
  return photoSold(id);
}

// ------------------------------------------------------------- tentativas ----
export async function loginFailures(ip, windowMin) {
  const [r] = await withDb(
    (s) => s`select count(*)::int as n, min(at) as first from login_attempts
              where ip = ${ip} and not ok and at > now() - (${windowMin}::int * interval '1 minute')`,
  );
  return { count: r.n, first: r.first };
}
export const recordLogin = (ip, ok) => withDb((s) => s`insert into login_attempts (ip, ok) values (${ip}, ${ok})`);
export const clearFailures = (ip) => withDb((s) => s`delete from login_attempts where ip = ${ip} and not ok`);
export const pruneAttempts = () => withDb((s) => s`delete from login_attempts where at < now() - interval '1 day'`);

/** Limite de requisições atômico (uma única instrução SQL). Devolve false se passou do limite. */
export async function rateAllowed(key, limit, windowSeconds) {
  const [r] = await withDb(
    (s) => s`insert into rate_limits (key, count, reset_at) values (${key}, 1, now() + (${windowSeconds}::int * interval '1 second'))
             on conflict (key) do update set
               count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
               reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
             returning count`,
  );
  return r.count <= limit;
}

// ------------------------------------------------------- backup / migração ----
export async function exportMeta() {
  const photos = await withDb(
    (s) => s`select id, title, description, modalidade, evento, price_cents, width, height, format, hidden, deleted, created_at, original_filename
               from photos order by created_at, id`,
  );
  const [{ n }] = await withDb((s) => s`select count(*)::int as n from orders`);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    config: { defaultPriceCents: await defaultPriceCents() },
    ordersTotal: n,
    photos: photos.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      modalidade: p.modalidade,
      evento: p.evento,
      priceCents: p.price_cents,
      width: p.width,
      height: p.height,
      format: p.format,
      hidden: p.hidden,
      deleted: p.deleted,
      createdAt: p.created_at,
      filename: p.original_filename,
    })),
  };
}

export async function exportOrders(offset, limit) {
  const [{ n }] = await withDb((s) => s`select count(*)::int as n from orders`);
  const rows = await withDb((s) => s`select * from orders order by created_at, id offset ${offset} limit ${limit}`);
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await withDb((s) => s`select order_id, photo_id, title, price_cents, downloads from order_items where order_id in ${s(ids)} order by id`)
    : [];
  return {
    total: n,
    orders: rows.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      amountCents: o.amount_cents,
      email: o.email,
      name: o.name,
      pix: o.pix,
      createdAt: o.created_at,
      reportedAt: o.reported_at,
      paidAt: o.paid_at,
      confirmedBy: o.confirmed_by,
      items: items.filter((i) => i.order_id === o.id).map((i) => ({ photoId: i.photo_id, title: i.title, priceCents: i.price_cents, downloads: i.downloads })),
    })),
  };
}

/** Pedido importado (idempotente): devolve true se foi criado agora. */
export async function importOrder(o) {
  return withDb((s) =>
    s.begin(async (t) => {
      const ins = await t`insert into orders (id, code, status, amount_cents, email, name, pix, reported_at, paid_at, confirmed_by, created_at)
                          values (${o.id}, ${o.code}, ${o.status}, ${o.amountCents}, ${o.email}, ${o.name ?? ""}, ${o.pix}, ${o.reportedAt ?? null},
                                  ${o.paidAt ?? null}, ${o.confirmedBy ?? null}, ${o.createdAt ?? new Date()})
                          on conflict do nothing returning id`;
      if (!ins.length) return false;
      for (const i of o.items) {
        // Se a foto não existe mais, guarda um registro arquivado só para o pedido continuar íntegro.
        await t`insert into photos (id, title, price_cents, hidden, deleted) values (${i.photoId}, ${i.title ?? ""}, ${i.priceCents}, true, true) on conflict (id) do nothing`;
        await t`insert into order_items (order_id, photo_id, title, price_cents, downloads) values (${o.id}, ${i.photoId}, ${i.title ?? ""}, ${i.priceCents}, ${i.downloads ?? 0})`;
      }
      return true;
    }),
  );
}

// ------------------------------------------------------ limpeza de dados ----
// Remove fotos arquivadas que nenhum pedido usa mais e devolve os caminhos dos arquivos a apagar.
async function purgeArchived(t, photoIds) {
  if (!photoIds.length) return [];
  const rows = await t`select id, original_path, preview_path, thumb_path, hero_path from photos p
                        where id in ${t(photoIds)} and deleted and not exists (select 1 from order_items i where i.photo_id = p.id)`;
  if (rows.length) await t`delete from photos where id in ${t(rows.map((r) => r.id))}`;
  return rows.flatMap((r) => [r.original_path, r.preview_path, r.thumb_path, r.hero_path]).filter(Boolean);
}

export async function deleteOrderById(id) {
  return withDb((s) =>
    s.begin(async (t) => {
      const items = await t`select photo_id from order_items where order_id = ${id}`;
      const gone = await t`delete from orders where id = ${id} returning id`;
      const paths = await purgeArchived(t, items.map((i) => i.photo_id));
      return { deleted: gone.length > 0, paths };
    }),
  );
}

/** what: "orders" | "photos" | "all". Fotos que ainda têm pedido só são arquivadas (o comprador mantém o acesso). */
export async function clearData(what) {
  return withDb((s) =>
    s.begin(async (t) => {
      const paths = [];
      let orders = 0;
      let photos = 0;
      if (what === "orders" || what === "all") {
        const ph = await t`select distinct photo_id from order_items`;
        orders = (await t`delete from orders returning id`).length;
        paths.push(...(await purgeArchived(t, ph.map((r) => r.photo_id))));
      }
      if (what === "photos" || what === "all") {
        const rows = await t`select id, original_path, preview_path, thumb_path, hero_path from photos p
                              where not exists (select 1 from order_items i where i.photo_id = p.id)`;
        if (rows.length) await t`delete from photos where id in ${t(rows.map((r) => r.id))}`;
        photos = rows.length;
        paths.push(...rows.flatMap((r) => [r.original_path, r.preview_path, r.thumb_path, r.hero_path]).filter(Boolean));
        await t`update photos set deleted = true, hidden = true where not deleted`;
      }
      return { orders, photos, paths };
    }),
  );
}
