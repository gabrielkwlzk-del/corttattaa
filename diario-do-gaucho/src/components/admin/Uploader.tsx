"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCheck, IconClose, IconUpload } from "../Icons";
import { api } from "./api";
import { Card } from "./ui";

type ItemState = "queued" | "uploading" | "processing" | "ready" | "failed";
interface Item {
  localId: string;
  file: File;
  state: ItemState;
  progress: number;
  error?: string;
  photoId?: string;
  preview?: string;
}

interface Prepared {
  photoId: string;
  key: string;
  exp: number;
  ticket: string;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/heif", "image/avif"];
const CONCURRENCY = 3;

function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha no envio (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Falha de rede no envio"));
    xhr.send(file);
  });
}

export function Uploader({ events, modalities, defaultPrice, maxMb }: { events: { id: string; name: string }[]; modalities: { id: string; name: string }[]; defaultPrice: string; maxMb: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [eventId, setEventId] = useState("");
  const [modalityId, setModalityId] = useState("");
  const [price, setPrice] = useState(defaultPrice);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const update = (localId: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));

  function addFiles(files: FileList | File[]) {
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const tooBig = file.size > maxMb * 1024 * 1024;
      const badType = !ACCEPT.includes(file.type);
      next.push({
        localId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        state: tooBig || badType ? "failed" : "queued",
        progress: 0,
        error: tooBig ? `Maior que ${maxMb} MB` : badType ? "Formato não aceito" : undefined,
        preview: !tooBig && !badType && file.size < 25 * 1024 * 1024 ? URL.createObjectURL(file) : undefined,
      });
    }
    setItems((l) => [...l, ...next]);
  }

  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  const start = useCallback(async () => {
    setError("");
    const queue = itemsRef.current.filter((i) => i.state === "queued");
    if (!queue.length) return;
    setRunning(true);
    try {
      // Prepara em blocos de 50 para obter URLs assinadas de upload.
      for (let b = 0; b < queue.length; b += 50) {
        const chunk = queue.slice(b, b + 50);
        const { uploads } = await api<{ uploads: Prepared[] }>("/api/admin/uploads", {
          method: "POST",
          json: { files: chunk.map((i) => ({ name: i.file.name, size: i.file.size, type: i.file.type })) },
        });
        let cursor = 0;
        const worker = async () => {
          while (cursor < chunk.length) {
            const idx = cursor++;
            const item = chunk[idx];
            const prep = uploads[idx];
            update(item.localId, { state: "uploading", photoId: prep.photoId });
            try {
              await putWithProgress(prep.upload.url, item.file, prep.upload.headers, (p) => update(item.localId, { progress: p }));
              await api("/api/admin/uploads/finalize", {
                method: "POST",
                json: { photoId: prep.photoId, key: prep.key, exp: prep.exp, ticket: prep.ticket, filename: item.file.name, eventId: eventId || null, modalityId: modalityId || null, price },
              });
              update(item.localId, { state: "processing", progress: 1 });
            } catch (e) {
              update(item.localId, { state: "failed", error: e instanceof Error ? e.message : "Erro" });
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao preparar envio.");
    } finally {
      setRunning(false);
    }
  }, [eventId, modalityId, price]);

  // Acompanha o processamento em segundo plano.
  useEffect(() => {
    const pending = items.filter((i) => i.state === "processing" && i.photoId);
    if (!pending.length) return;
    const t = setTimeout(async () => {
      try {
        const { photos } = await api<{ photos: { id: string; status: string; processing_error: string | null }[] }>("/api/admin/photos/status", {
          method: "POST",
          json: { ids: pending.map((p) => p.photoId) },
        });
        setItems((list) =>
          list.map((i) => {
            const p = photos.find((x) => x.id === i.photoId);
            if (!p || i.state !== "processing") return i;
            if (p.status === "ready") return { ...i, state: "ready" };
            if (p.status === "failed") return { ...i, state: "failed", error: p.processing_error ?? "Falha no processamento" };
            return i;
          }),
        );
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [items]);

  const counts = items.reduce(
    (acc, i) => ({ ...acc, [i.state]: (acc[i.state] ?? 0) + 1 }),
    {} as Partial<Record<ItemState, number>>,
  );
  const done = (counts.ready ?? 0) + (counts.failed ?? 0);
  const overall = items.length ? done / items.length : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit xl:sticky xl:top-10">
        <h2 className="font-semibold">Configurações do lote</h2>
        <p className="mt-1 text-sm text-titanium">Aplicadas a todas as fotos enviadas agora. Você pode editar cada uma depois.</p>
        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="u-event">Evento</label>
            <select id="u-event" className="field" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Sem evento</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-mod">Modalidade</label>
            <select id="u-mod" className="field" value={modalityId} onChange={(e) => setModalityId(e.target.value)}>
              <option value="">Sem modalidade</option>
              {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-price">Preço por foto (R$)</label>
            <input id="u-price" className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <p className="text-xs text-titanium">
            Não encontrou o evento? <Link href="/admin/eventos" className="text-sky">Crie aqui</Link>.
          </p>
        </div>
        <button type="button" className="btn btn-sky mt-6 w-full" disabled={running || !counts.queued} onClick={start}>
          {running ? "Enviando…" : counts.queued ? `Enviar ${counts.queued} foto${counts.queued === 1 ? "" : "s"}` : "Selecione as fotos"}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <div className="space-y-5">
        <motion.div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          animate={{ scale: dragging ? 1.01 : 1 }}
          className={`glass relative flex flex-col items-center justify-center rounded-[30px] border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-sky/70 bg-sky/[0.06]" : "border-white/10"
          }`}
        >
          <div className="grid size-14 place-items-center rounded-2xl bg-white/[0.07]">
            <IconUpload className="size-6 text-sky" />
          </div>
          <p className="mt-4 text-lg font-semibold tracking-tight">Arraste as fotografias aqui</p>
          <p className="mt-1 text-sm text-titanium">JPEG, PNG, WebP ou TIFF · até {maxMb} MB cada · centenas por vez</p>
          <button type="button" className="btn btn-glass mt-5" onClick={() => input.current?.click()}>
            Escolher arquivos
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT.join(",")}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </motion.div>

        {items.length > 0 && (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold">{items.length} arquivos</span>
                <span className="text-titanium">
                  {" · "}{counts.ready ?? 0} prontas · {counts.processing ?? 0} processando · {counts.failed ?? 0} com erro
                </span>
              </div>
              <div className="flex gap-2">
                {!running && done === items.length && (
                  <Link href="/admin/fotos" className="btn btn-primary btn-sm">Ver no acervo</Link>
                )}
                <button
                  type="button"
                  className="btn btn-glass btn-sm"
                  disabled={running}
                  onClick={() => setItems((l) => l.filter((i) => i.state !== "ready" && i.state !== "failed"))}
                >
                  Limpar concluídas
                </button>
              </div>
            </div>
            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div className="h-full rounded-full bg-sky" animate={{ width: `${overall * 100}%` }} />
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <motion.li
                    key={i.localId}
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="relative overflow-hidden rounded-[20px] bg-white/[0.04] ring-1 ring-white/[0.06]"
                  >
                    <div className="relative aspect-[4/3] bg-ink-3">
                      {i.preview && <img src={i.preview} alt="" className="h-full w-full object-cover opacity-80" />}
                      <div className="absolute inset-0 grid place-items-center">
                        <StateBadge item={i} />
                      </div>
                      {i.state === "queued" && !running && (
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => setItems((l) => l.filter((x) => x.localId !== i.localId))}
                          className="btn btn-glass absolute right-2 top-2 size-7 p-0"
                        >
                          <IconClose className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {i.state === "uploading" && (
                      <div className="h-1 bg-white/5"><div className="h-full bg-sky transition-[width]" style={{ width: `${i.progress * 100}%` }} /></div>
                    )}
                    <div className="p-2.5">
                      <p className="truncate text-xs font-medium">{i.file.name}</p>
                      <p className={`truncate text-[11px] ${i.state === "failed" ? "text-danger" : "text-titanium"}`}>
                        {i.error ?? `${(i.file.size / 1024 / 1024).toFixed(1)} MB`}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function StateBadge({ item }: { item: Item }) {
  const map: Record<ItemState, { text: string; cls: string }> = {
    queued: { text: "Na fila", cls: "bg-black/50 text-white/80" },
    uploading: { text: `${Math.round(item.progress * 100)}%`, cls: "bg-black/60 text-white" },
    processing: { text: "Gerando prévia…", cls: "bg-sky/80 text-ink" },
    ready: { text: "Pronta", cls: "bg-success/90 text-ink" },
    failed: { text: "Erro", cls: "bg-danger/90 text-ink" },
  };
  const s = map[item.state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${s.cls}`}>
      {item.state === "ready" && <IconCheck className="size-3" />}
      {s.text}
    </span>
  );
}
