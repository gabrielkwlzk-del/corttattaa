import postgres from "postgres";
import { SCHEMA_SQL } from "./schema.mjs";

/**
 * Conexão com o PostgreSQL (Neon/Supabase/qualquer um).
 * - Uma conexão por instância, reaproveitada entre requisições.
 * - Migração com trava (advisory lock): instâncias simultâneas não se atropelam.
 * - Se a conexão cair (ex.: banco "dormiu"), reconecta e repete a operação uma vez.
 */
export class DbNotConfigured extends Error {
  constructor() {
    super("Banco de dados não conectado.");
    this.name = "DbNotConfigured";
  }
}

export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;

let client;
let ready;

function connect() {
  const url = dbUrl();
  if (!url) throw new DbNotConfigured();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    prepare: false, // compatível com pooler (pgbouncer) do Neon/Supabase
    ssl: local ? false : "require",
    onnotice: () => {},
    connection: { application_name: "gauchofotos" },
  });
}

async function migrate(sql) {
  await sql.begin(async (t) => {
    await t`select pg_advisory_xact_lock(727274)`;
    await t.unsafe(SCHEMA_SQL);
  });
}

function reset() {
  const old = client;
  client = undefined;
  ready = undefined;
  old?.end({ timeout: 1 }).catch(() => {});
}

const TRANSIENT = /CONNECTION_(CLOSED|ENDED|DESTROYED)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|57P01|08006|08003|CONNECT_TIMEOUT|terminat/i;

/** Executa `fn(sql)` com migração garantida e uma repetição se a conexão tiver caído. */
export async function withDb(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      client ??= connect();
      ready ??= migrate(client);
      await ready;
      return await fn(client);
    } catch (e) {
      if (e instanceof DbNotConfigured) throw e;
      const transient = TRANSIENT.test(`${e?.code ?? ""} ${e?.message ?? ""}`);
      if (transient) reset();
      if (!transient || attempt >= 1) throw e;
    }
  }
}

export async function closeDb() {
  if (client) await client.end({ timeout: 5 }).catch(() => {});
  client = undefined;
  ready = undefined;
}

// ----------------------------------------------------------- configurações --
export async function getSetting(key) {
  const rows = await withDb((s) => s`select value from settings where key = ${key}`);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await withDb(
    (s) => s`insert into settings (key, value, updated_at) values (${key}, ${s.json(value)}, now())
             on conflict (key) do update set value = excluded.value, updated_at = now()`,
  );
}
