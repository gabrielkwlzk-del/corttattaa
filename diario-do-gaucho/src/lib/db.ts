import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Camada mínima de acesso ao PostgreSQL.
 * - Produção: PostgreSQL/Supabase via `postgres` (DATABASE_URL).
 * - Desenvolvimento/testes sem DATABASE_URL: PGlite (Postgres em WebAssembly),
 *   com exatamente as mesmas migrations.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Datas viram strings ISO para serialização previsível (RSC/JSON). */
function normalize<T>(rows: unknown[]): T[] {
  for (const row of rows as Record<string, unknown>[]) {
    for (const k in row) {
      const v = row[k];
      if (v instanceof Date) row[k] = v.toISOString();
    }
  }
  return rows as T[];
}

type G = typeof globalThis & { __dgDb?: Promise<Db> };
const g = globalThis as G;

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    prepare: false, // compatível com o pooler do Supabase (modo transaction)
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    onnotice: () => {},
  });
  const wrap = (s: typeof sql): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return normalize<T>(Array.from(await s.unsafe(text, params as never[])));
    },
  });
  return {
    ...wrap(sql),
    async tx(fn) {
      return (await sql.begin(async (t) => fn(wrap(t as unknown as typeof sql)))) as never;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) await fs.mkdir(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  // PGlite é single-connection: serializamos as operações para que
  // transações não se intercalem com outras consultas.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const direct: Queryable = {
    async query<T>(text: string, params: unknown[] = []) {
      const r = await pg.query<T>(text, params);
      return normalize<T>(r.rows);
    },
  };
  return {
    query: (text, params) => serial(() => direct.query(text, params)) as never,
    tx: (fn) =>
      serial(() =>
        pg.transaction(async (t) =>
          fn({
            async query<T>(text: string, params: unknown[] = []) {
              return normalize<T>((await t.query<T>(text, params)).rows);
            },
          }),
        ),
      ),
    async close() {
      await pg.close();
    },
  };
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = await fs.readFile(path.join(dir, file), "utf8");
    await db.tx(async (q) => {
      await execMulti(q, sqlText);
      await q.query("insert into schema_migrations (name) values ($1) on conflict do nothing", [file]);
    });
    done.push(file);
  }
  return done;
}

/** Executa um arquivo SQL com múltiplas instruções, sem parâmetros. */
async function execMulti(q: Queryable, text: string) {
  for (const stmt of splitSql(text)) await q.query(stmt);
}

export function splitSql(text: string): string[] {
  const noComments = text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function init(): Promise<Db> {
  const url = env.databaseUrl;
  if (!url && process.env.NODE_ENV === "production") {
    // Em produção o banco local em arquivo seria perdido a cada deploy.
    throw new Error("DATABASE_URL não configurada. Defina a conexão PostgreSQL/Supabase.");
  }
  let db: Db;
  if (!url) db = await createPglite(path.join(process.cwd(), ".data", "pglite"));
  else if (url === "memory://") db = await createPglite();
  else db = await createPostgres(url);
  if (!url || url === "memory://" || process.env.AUTO_MIGRATE !== "false") {
    await migrate(db);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__dgDb) {
    g.__dgDb = init().catch((e) => {
      g.__dgDb = undefined;
      throw e;
    });
  }
  return g.__dgDb;
}

/** Atalho: consulta usando o banco global. */
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await getDb()).query<T>(text, params);
}

export async function resetDbForTests() {
  if (g.__dgDb) {
    try {
      await (await g.__dgDb).close();
    } catch {}
  }
  g.__dgDb = undefined;
}
