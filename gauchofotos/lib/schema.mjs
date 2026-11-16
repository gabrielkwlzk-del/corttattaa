// Esquema do banco (PostgreSQL). Idempotente: pode rodar quantas vezes for preciso.
// Valores monetários sempre em centavos (inteiros).
export const SCHEMA_SQL = `
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key,
  title text not null default '',
  description text not null default '',
  modalidade text not null default '',
  evento text not null default '',
  price_cents integer not null check (price_cents between 100 and 10000000),
  width integer,
  height integer,
  format text,
  mime text,
  bytes bigint,
  original_filename text,
  original_path text,
  preview_path text,
  thumb_path text,
  hero_path text,
  hidden boolean not null default false,
  deleted boolean not null default false,
  v integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists photos_public_idx on photos (created_at desc) where not hidden and not deleted;

create table if not exists orders (
  id text primary key,
  code text not null unique,
  status text not null check (status in ('pending','paid','cancelled')),
  amount_cents integer not null check (amount_cents > 0),
  email text not null,
  name text not null default '',
  pix text not null,
  reported_at timestamptz,
  paid_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders (status, created_at desc);

create table if not exists order_items (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete restrict,
  title text not null default '',
  price_cents integer not null check (price_cents > 0),
  downloads integer not null default 0
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_photo_idx on order_items (photo_id);

create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts (ip, at desc);

create table if not exists rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
`;
