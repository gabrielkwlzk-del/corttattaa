-- Diário do Gaúcho — esquema inicial
-- Valores monetários sempre em centavos (integer) para evitar erros de arredondamento.

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique,
  event_date date,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists modalities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  modality_id uuid references modalities(id) on delete set null,
  title text not null default '',
  description text not null default '',
  price_cents integer not null check (price_cents >= 100 and price_cents <= 10000000),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  visibility text not null default 'public' check (visibility in ('public', 'hidden')),
  original_path text not null,
  preview_path text,
  thumb_path text,
  width integer,
  height integer,
  bytes bigint,
  mime text,
  original_filename text,
  taken_at timestamptz,
  processing_error text,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photos_public_idx on photos (created_at desc)
  where status = 'ready' and visibility = 'public' and deleted_at is null;
create index if not exists photos_event_idx on photos (event_id);
create index if not exists photos_modality_idx on photos (modality_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  access_token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  customer_name text,
  customer_email text,
  payment_provider text not null check (payment_provider in ('mercadopago', 'static')),
  provider_payment_id text,
  pix_txid text,
  pix_copia_cola text,
  expires_at timestamptz,
  customer_reported_paid_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on orders (status, created_at desc);
create unique index if not exists orders_provider_payment_idx
  on orders (payment_provider, provider_payment_id) where provider_payment_id is not null;

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete restrict,
  price_cents integer not null check (price_cents > 0),
  title_snapshot text not null default '',
  download_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_photo_idx on order_items (photo_id);

-- Registro de transações confirmadas / recebidas do provedor.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text not null,
  status text not null,
  amount_cents integer not null,
  source text not null check (source in ('webhook', 'poll', 'manual')),
  note text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id, status)
);

-- Idempotência de webhooks: cada notificação é processada uma única vez.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  received_at timestamptz not null default now(),
  result text,
  unique (provider, event_key)
);

create table if not exists downloads (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  ip text,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_idx on login_attempts (ip, created_at desc);

insert into settings (key, value) values ('default_price_cents', '900'::jsonb)
  on conflict (key) do nothing;

-- Row Level Security: nenhuma política pública. Todo acesso passa pelo servidor
-- (conexão direta com o papel dono das tabelas), então a chave anon do Supabase
-- não consegue ler nem escrever nada.
alter table settings enable row level security;
alter table events enable row level security;
alter table modalities enable row level security;
alter table photos enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table transactions enable row level security;
alter table webhook_events enable row level security;
alter table downloads enable row level security;
alter table admin_sessions enable row level security;
alter table login_attempts enable row level security;
