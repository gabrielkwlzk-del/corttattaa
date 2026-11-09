import "server-only";
import { q } from "../db";
import type { OrderRow } from "../types";
import { isUuid } from "./catalog";

export async function dashboardStats() {
  const [totals] = await q<{
    revenue_cents: number;
    paid_orders: number;
    pending_orders: number;
    awaiting_review: number;
    photos_sold: number;
    photos_total: number;
    revenue_30d_cents: number;
  }>(
    `select
       coalesce((select sum(amount_cents) from orders where status='paid'), 0)::int as revenue_cents,
       (select count(*) from orders where status='paid')::int as paid_orders,
       (select count(*) from orders where status='pending')::int as pending_orders,
       (select count(*) from orders where status='pending' and customer_reported_paid_at is not null)::int as awaiting_review,
       (select count(distinct oi.photo_id) from order_items oi join orders o on o.id=oi.order_id where o.status='paid')::int as photos_sold,
       (select count(*) from photos where deleted_at is null)::int as photos_total,
       coalesce((select sum(amount_cents) from orders where status='paid' and paid_at > now() - interval '30 days'), 0)::int as revenue_30d_cents`,
  );
  const daily = await q<{ day: string; cents: number; orders: number }>(
    `select to_char(d, 'YYYY-MM-DD') as day,
            coalesce(sum(o.amount_cents), 0)::int as cents,
            count(o.id)::int as orders
       from generate_series((now() at time zone 'America/Sao_Paulo')::date - 29,
                            (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
       left join orders o on o.status='paid' and (o.paid_at at time zone 'America/Sao_Paulo')::date = d::date
      group by d order by d`,
  );
  return { totals, daily };
}

export interface AdminOrder extends OrderRow {
  item_count: number;
  titles: string | null;
}

export async function listOrders(f: { status?: string; q?: string; page?: number } = {}) {
  const where: string[] = ["true"];
  const params: unknown[] = [];
  if (f.status && ["pending", "paid", "expired", "cancelled"].includes(f.status)) {
    params.push(f.status);
    where.push(`o.status = $${params.length}`);
  }
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().slice(0, 80)}%`);
    where.push(`(o.code ilike $${params.length} or o.customer_email ilike $${params.length} or o.customer_name ilike $${params.length})`);
  }
  const page = Math.max(1, f.page ?? 1);
  params.push(51, (page - 1) * 50);
  const rows = await q<AdminOrder>(
    `select o.*, (select count(*)::int from order_items oi where oi.order_id=o.id) as item_count,
            (select string_agg(oi.title_snapshot, ', ') from order_items oi where oi.order_id=o.id) as titles
       from orders o where ${where.join(" and ")}
      order by (o.status='pending' and o.customer_reported_paid_at is not null) desc, o.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { orders: rows.slice(0, 50), hasMore: rows.length > 50, page };
}

export async function orderDetail(id: string) {
  if (!isUuid(id)) return null;
  const [order] = await q<OrderRow>("select * from orders where id=$1", [id]);
  if (!order) return null;
  const items = await q<{ id: string; photo_id: string; price_cents: number; title_snapshot: string; download_count: number }>(
    "select id, photo_id, price_cents, title_snapshot, download_count from order_items where order_id=$1",
    [id],
  );
  const transactions = await q<{ id: string; provider: string; provider_payment_id: string; status: string; amount_cents: number; source: string; note: string | null; created_at: string }>(
    "select id, provider, provider_payment_id, status, amount_cents, source, note, created_at from transactions where order_id=$1 order by created_at",
    [id],
  );
  return { order, items, transactions };
}

export async function listSoldPhotos() {
  return q<{ photo_id: string; title: string; version: number; sales: number; revenue_cents: number; last_sale: string; downloads: number; deleted_at: string | null }>(
    `select p.id as photo_id, p.title, p.version, p.deleted_at,
            count(*)::int as sales, sum(oi.price_cents)::int as revenue_cents,
            max(o.paid_at) as last_sale, sum(oi.download_count)::int as downloads
       from order_items oi
       join orders o on o.id = oi.order_id and o.status = 'paid'
       join photos p on p.id = oi.photo_id
      group by p.id order by max(o.paid_at) desc limit 500`,
  );
}
