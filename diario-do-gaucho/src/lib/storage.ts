import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { hmac, safeEqual } from "./crypto";

/**
 * Armazenamento de arquivos com dois "baldes" separados:
 *  - originals: PRIVADO. Arquivos originais em alta resolução, sem marca d'água.
 *               Só é acessível por URL assinada e temporária após pagamento confirmado.
 *  - previews:  prévias com marca d'água gravada nos pixels e miniaturas.
 *
 * Drivers: Supabase Storage (produção) ou disco local (desenvolvimento/VPS).
 */
export type Bucket = "originals" | "previews";

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StorageDriver {
  put(bucket: Bucket, key: string, data: Buffer, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Buffer>;
  remove(bucket: Bucket, keys: string[]): Promise<void>;
  /** URL para o navegador do administrador enviar o original diretamente. */
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  /** URL assinada e temporária para baixar o original. */
  createDownloadUrl(key: string, filename: string, ttlSeconds: number): Promise<string>;
}

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,255}$/;
export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Chave de armazenamento inválida.");
  }
}

// ----------------------------------------------------------------- local --
export function signLocal(parts: Record<string, string | number>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join("&");
  return hmac(`storage:${canonical}`);
}

export function verifyLocalSignature(parts: Record<string, string | number>, sig: string): boolean {
  return safeEqual(signLocal(parts), sig);
}

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}

  private file(bucket: Bucket, key: string) {
    assertSafeKey(key);
    const base = path.resolve(this.root, bucket);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("Caminho inválido.");
    return full;
  }

  async put(bucket: Bucket, key: string, data: Buffer) {
    const f = this.file(bucket, key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data);
  }

  async get(bucket: Bucket, key: string) {
    return fs.readFile(this.file(bucket, key));
  }

  async remove(bucket: Bucket, keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(this.file(bucket, k), { force: true })));
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const sig = signLocal({ op: "upload", key, exp });
    const qs = new URLSearchParams({ key, exp: String(exp), sig });
    return { url: `/api/admin/uploads/local?${qs}`, method: "PUT", headers: { "content-type": contentType } };
  }

  async createDownloadUrl(key: string, filename: string, ttlSeconds: number) {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signLocal({ op: "download", key, exp, name: filename });
    const qs = new URLSearchParams({ key, exp: String(exp), name: filename, sig });
    return `/api/files/original?${qs}`;
  }
}

// -------------------------------------------------------------- supabase --
class SupabaseStorage implements StorageDriver {
  private clientPromise: Promise<import("@supabase/supabase-js").SupabaseClient> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
        createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      );
    }
    return this.clientPromise;
  }

  private bucketName(b: Bucket) {
    return b === "originals" ? env.originalsBucket : env.previewsBucket;
  }

  async put(bucket: Bucket, key: string, data: Buffer, contentType: string) {
    assertSafeKey(key);
    const c = await this.client();
    const { error } = await c.storage
      .from(this.bucketName(bucket))
      .upload(key, data, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`Falha ao gravar arquivo: ${error.message}`);
  }

  async get(bucket: Bucket, key: string) {
    assertSafeKey(key);
    const c = await this.client();
    const { data, error } = await c.storage.from(this.bucketName(bucket)).download(key);
    if (error || !data) throw new Error(`Arquivo não encontrado: ${error?.message ?? key}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(bucket: Bucket, keys: string[]) {
    if (!keys.length) return;
    keys.forEach(assertSafeKey);
    const c = await this.client();
    await c.storage.from(this.bucketName(bucket)).remove(keys);
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    assertSafeKey(key);
    const c = await this.client();
    const { data, error } = await c.storage.from(env.originalsBucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`Falha ao preparar upload: ${error?.message}`);
    return { url: data.signedUrl, method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" } };
  }

  async createDownloadUrl(key: string, filename: string, ttlSeconds: number) {
    assertSafeKey(key);
    const c = await this.client();
    const { data, error } = await c.storage
      .from(env.originalsBucket)
      .createSignedUrl(key, ttlSeconds, { download: filename });
    if (error || !data) throw new Error(`Falha ao gerar link: ${error?.message}`);
    return data.signedUrl;
  }
}

type G = typeof globalThis & { __dgStorage?: StorageDriver };
const g = globalThis as G;

export function storage(): StorageDriver {
  if (!g.__dgStorage) {
    g.__dgStorage =
      env.storageDriver === "supabase"
        ? new SupabaseStorage()
        : new LocalStorage(path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.localStorageDir));
  }
  return g.__dgStorage;
}

export function resetStorageForTests() {
  g.__dgStorage = undefined;
}
