import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { hmac, safeEqual } from "./auth.mjs";

/**
 * Armazenamento de arquivos.
 *  - Produção (Vercel): Vercel Blob PRIVADO. Os originais nunca têm URL pública.
 *  - Testes/dev: pasta local.
 * Nunca cai para o disco em produção por engano: sem token do Blob, dá erro claro.
 */
export class FilesNotConfigured extends Error {
  constructor() {
    super("Armazenamento de fotos não conectado (falta o Vercel Blob).");
    this.name = "FilesNotConfigured";
  }
}

const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9/_.\-]{0,300}$/;
export function assertSafePath(p) {
  if (!SAFE.test(p) || p.includes("..") || p.includes("//")) throw new Error("Caminho de arquivo inválido.");
  return p;
}

// ------------------------------------------------------------ Vercel Blob ----
function blobDriver() {
  let sdk;
  const lib = async () => (sdk ??= await import("@vercel/blob"));
  return {
    name: "vercel-blob",
    async put(p, body, contentType) {
      const { put } = await lib();
      await put(assertSafePath(p), body, {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType,
        cacheControlMaxAge: 60,
      });
    },
    async get(p) {
      const { get } = await lib();
      // useCache:false = lê sempre o conteúdo mais recente direto da origem.
      const r = await get(assertSafePath(p), { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return { stream: r.stream, size: r.blob.size, contentType: r.blob.contentType };
    },
    async head(p) {
      const { head, BlobNotFoundError } = await lib();
      try {
        const h = await head(assertSafePath(p));
        return { size: h.size, contentType: h.contentType };
      } catch (e) {
        if (e instanceof BlobNotFoundError) return null;
        throw e;
      }
    },
    async del(paths) {
      const list = paths.filter(Boolean).map(assertSafePath);
      if (!list.length) return;
      const { del } = await lib();
      await del(list);
    },
  };
}

// ---------------------------------------------------------------- local ----
function localDriver(root) {
  const resolve = (p) => {
    assertSafePath(p);
    const full = path.resolve(root, p);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Caminho de arquivo inválido.");
    return full;
  };
  return {
    name: "local",
    async put(p, body) {
      const f = resolve(p);
      await fsp.mkdir(path.dirname(f), { recursive: true });
      await fsp.writeFile(f, body);
    },
    async get(p) {
      const f = resolve(p);
      try {
        const st = await fsp.stat(f);
        return { stream: Readable.toWeb(fs.createReadStream(f)), size: st.size, contentType: "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async head(p) {
      try {
        const st = await fsp.stat(resolve(p));
        return { size: st.size, contentType: "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async del(paths) {
      await Promise.all(paths.filter(Boolean).map((p) => fsp.rm(resolve(p), { force: true })));
    },
  };
}

let driver;
export function files() {
  if (driver) return driver;
  if (process.env.BLOB_READ_WRITE_TOKEN) driver = blobDriver();
  else if (process.env.FILES_DRIVER === "local") driver = localDriver(path.resolve(process.env.LOCAL_FILES_DIR || ".local-data/files"));
  else throw new FilesNotConfigured();
  return driver;
}
export const resetFilesForTests = () => (driver = undefined);

export async function getBuffer(p) {
  const r = await files().get(p);
  if (!r) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

// Upload local (só quando não há Vercel Blob): URL assinada para o navegador enviar o arquivo.
export const signLocal = (parts) =>
  hmac(`files:${Object.keys(parts).sort().map((k) => `${k}=${parts[k]}`).join("&")}`);
export const verifyLocal = (parts, sig) => safeEqual(signLocal(parts), String(sig));
