"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { AdminPhoto } from "@/lib/types";
import { IconCheck, IconClose, IconEye, IconEyeOff, IconRefresh, IconSearch, IconTrash } from "../Icons";
import { formatDate, formatPrice, thumbUrl } from "../media";
import { api } from "./api";

type Opt = { id: string; name: string };
interface Filters { q: string; evento: string; status: string; visibilidade: string }

function centsToInput(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}

export function PhotoManager({ photos, hasMore, page, events, modalities, filters }: { photos: AdminPhoto[]; hasMore: boolean; page: number; events: Opt[]; modalities: Opt[]; filters: Filters }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminPhoto | null>(null);
  const [q, setQ] = useState(filters.q);
  const [toast, setToast] = useState("");

  useEffect(() => setSelected(new Set()), [photos]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Atualiza fotos em processamento automaticamente.
  useEffect(() => {
    if (!photos.some((p) => p.status === "processing")) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [photos, router]);

  const go = (patch: Partial<Filters> & { pagina?: number }) => {
    const next = { ...filters, ...patch };
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && sp.set(k, String(v)));
    startTransition(() => router.push(`${path}?${sp}`));
  };

  const refresh = (msg: string) => {
    setToast(msg);
    startTransition(() => router.refresh());
  };

  async function bulk(patch: Record<string, unknown>, msg: string) {
    try {
      await api("/api/admin/photos", { method: "PATCH", json: { ids: [...selected], patch } });
      refresh(msg);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove(ids: string[]) {
    if (!confirm(`Excluir ${ids.length} fotografia(s)? Fotos já vendidas serão apenas arquivadas para preservar o acesso dos compradores.`)) return;
    try {
      const r = await api<{ archived: number; removed: number }>("/api/admin/photos", { method: "DELETE", json: { ids } });
      setEditing(null);
      refresh(`${r.removed} excluída(s)${r.archived ? `, ${r.archived} arquivada(s)` : ""}.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Erro");
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={pending ? "opacity-80 transition-opacity" : "transition-opacity"}>
      {/* Filtros */}
      <div className="glass mb-5 flex flex-col gap-2 rounded-[24px] p-2.5 md:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q, pagina: 1 });
          }}
        >
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-titanium" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou arquivo" className="field h-11 rounded-full border-transparent pl-10" />
        </form>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <select className="field h-11 rounded-full border-transparent text-sm md:w-48" value={filters.evento} onChange={(e) => go({ evento: e.target.value, pagina: 1 })} aria-label="Evento">
            <option value="">Todos eventos</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select className="field h-11 rounded-full border-transparent text-sm md:w-40" value={filters.status} onChange={(e) => go({ status: e.target.value, pagina: 1 })} aria-label="Status">
            <option value="">Todos status</option>
            <option value="ready">Prontas</option>
            <option value="processing">Processando</option>
            <option value="failed">Com erro</option>
          </select>
          <select className="field h-11 rounded-full border-transparent text-sm md:w-40" value={filters.visibilidade} onChange={(e) => go({ visibilidade: e.target.value, pagina: 1 })} aria-label="Visibilidade">
            <option value="">Visíveis e ocultas</option>
            <option value="public">Visíveis</option>
            <option value="hidden">Ocultas</option>
          </select>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="glass rounded-[28px] py-20 text-center text-titanium">Nenhuma fotografia encontrada.</div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-sm text-titanium">
            <button
              type="button"
              className="rounded-full px-3 py-1 hover:bg-white/5"
              onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))}
            >
              {selected.size === photos.length ? "Limpar seleção" : "Selecionar todas desta página"}
            </button>
            <span>Página {page}</span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {photos.map((p) => {
              const sel = selected.has(p.id);
              return (
                <motion.li key={p.id} layout className={`group relative overflow-hidden rounded-[22px] bg-white/[0.04] ring-1 transition ${sel ? "ring-2 ring-sky" : "ring-white/[0.06]"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => setEditing(p)}>
                    <div className="relative aspect-[4/3] bg-ink-3">
                      {p.status === "ready" ? (
                        <img src={thumbUrl(p.id, p.version)} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] ${p.visibility === "hidden" ? "opacity-40" : ""}`} />
                      ) : (
                        <div className={`grid h-full place-items-center text-xs ${p.status === "failed" ? "text-danger" : "skeleton text-titanium"}`}>
                          {p.status === "failed" ? "Falha no processamento" : "Processando…"}
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        {p.visibility === "hidden" && <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] backdrop-blur">Oculta</span>}
                        {p.sold_count > 0 && <span className="rounded-full bg-success/85 px-2 py-0.5 text-[10px] font-semibold text-ink">{p.sold_count} venda(s)</span>}
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium">{p.title || p.original_filename || "Sem título"}</p>
                      <p className="truncate text-xs text-titanium">{formatPrice(p.price_cents)} · {p.event_name ?? "Sem evento"}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-label={sel ? "Desmarcar" : "Selecionar"}
                    aria-pressed={sel}
                    className={`absolute left-2 top-2 grid size-7 place-items-center rounded-full border backdrop-blur transition ${sel ? "border-sky bg-sky text-ink" : "border-white/40 bg-black/30 text-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
                  >
                    <IconCheck className="size-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
          <div className="mt-6 flex justify-center gap-2">
            {page > 1 && <button type="button" className="btn btn-glass btn-sm" onClick={() => go({ pagina: page - 1 } as never)}>Anterior</button>}
            {hasMore && <button type="button" className="btn btn-glass btn-sm" onClick={() => go({ pagina: page + 1 } as never)}>Próxima</button>}
          </div>
        </>
      )}

      {/* Barra de ações em lote */}
      <AnimatePresence>
        {selected.size > 0 && (
          <BulkBar
            count={selected.size}
            events={events}
            modalities={modalities}
            onClear={() => setSelected(new Set())}
            onPatch={bulk}
            onDelete={() => remove([...selected])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <EditDrawer
            key={editing.id}
            photo={editing}
            events={events}
            modalities={modalities}
            onClose={() => setEditing(null)}
            onSaved={(msg) => {
              setEditing(null);
              refresh(msg);
            }}
            onDelete={() => remove([editing.id])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="glass-strong fixed bottom-24 left-1/2 z-[70] rounded-full px-5 py-3 text-sm"
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BulkBar({ count, events, modalities, onClear, onPatch, onDelete }: { count: number; events: Opt[]; modalities: Opt[]; onClear: () => void; onPatch: (p: Record<string, unknown>, msg: string) => void; onDelete: () => void }) {
  const [price, setPrice] = useState("");
  return (
    <motion.div
      initial={{ y: 100, opacity: 0, x: "-50%" }}
      animate={{ y: 0, opacity: 1, x: "-50%" }}
      exit={{ y: 100, opacity: 0, x: "-50%" }}
      className="glass-strong fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-24px)] max-w-4xl flex-wrap items-center gap-2 rounded-[26px] p-2.5"
    >
      <span className="px-3 text-sm font-semibold">{count} selecionada(s)</span>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (price) onPatch({ price }, "Preço atualizado.");
        }}
      >
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço R$" inputMode="decimal" className="field h-9 w-28 rounded-full text-sm" aria-label="Novo preço" />
        <button className="btn btn-glass btn-sm" disabled={!price}>Aplicar</button>
      </form>
      <select className="field h-9 w-40 rounded-full text-sm" defaultValue="" onChange={(e) => e.target.value && onPatch({ event_id: e.target.value === "none" ? null : e.target.value }, "Evento atualizado.")} aria-label="Mover para evento">
        <option value="">Evento…</option>
        <option value="none">Sem evento</option>
        {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select className="field h-9 w-40 rounded-full text-sm" defaultValue="" onChange={(e) => e.target.value && onPatch({ modality_id: e.target.value === "none" ? null : e.target.value }, "Modalidade atualizada.")} aria-label="Definir modalidade">
        <option value="">Modalidade…</option>
        <option value="none">Sem modalidade</option>
        {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button type="button" className="btn btn-glass btn-sm" onClick={() => onPatch({ visibility: "hidden" }, "Fotos ocultadas.")}><IconEyeOff className="size-4" /> Ocultar</button>
      <button type="button" className="btn btn-glass btn-sm" onClick={() => onPatch({ visibility: "public" }, "Fotos publicadas.")}><IconEye className="size-4" /> Publicar</button>
      <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}><IconTrash className="size-4" /> Excluir</button>
      <button type="button" className="btn btn-glass btn-sm ml-auto size-9 p-0" aria-label="Limpar seleção" onClick={onClear}><IconClose className="size-4" /></button>
    </motion.div>
  );
}

function EditDrawer({ photo, events, modalities, onClose, onSaved, onDelete }: { photo: AdminPhoto; events: Opt[]; modalities: Opt[]; onClose: () => void; onSaved: (msg: string) => void; onDelete: () => void }) {
  const [form, setForm] = useState({
    title: photo.title,
    description: photo.description,
    price: centsToInput(photo.price_cents),
    event_id: photo.event_id ?? "",
    modality_id: photo.modality_id ?? "",
    visibility: photo.visibility,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/photos", {
        method: "PATCH",
        json: { ids: [photo.id], patch: { ...form, event_id: form.event_id || null, modality_id: form.modality_id || null } },
      });
      onSaved("Fotografia atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
      setSaving(false);
    }
  }

  async function reprocess() {
    setSaving(true);
    try {
      await api("/api/admin/photos/reprocess", { method: "POST", json: { id: photo.id } });
      onSaved("Prévia regenerada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <motion.div className="fixed inset-0 z-[60] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Fechar" tabIndex={-1} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <motion.form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-label="Editar fotografia"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        className="glass-strong relative m-0 flex h-full w-full max-w-md flex-col overflow-y-auto rounded-none p-6 sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-[30px]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Editar fotografia</h2>
          <button type="button" onClick={onClose} className="btn btn-glass size-9 p-0" aria-label="Fechar"><IconClose className="size-4" /></button>
        </div>
        {photo.status === "ready" ? (
          <img src={thumbUrl(photo.id, photo.version)} alt="" className="mt-5 aspect-[4/3] w-full rounded-[20px] object-cover" />
        ) : (
          <div className="mt-5 rounded-[20px] bg-white/5 p-5 text-sm text-titanium">
            {photo.status === "failed" ? `Falha: ${photo.processing_error ?? "erro desconhecido"}` : "Processando…"}
          </div>
        )}
        <p className="mt-3 text-xs text-titanium">
          {photo.original_filename} · {photo.width && photo.height ? `${photo.width}×${photo.height}px · ` : ""}
          {photo.bytes ? `${(photo.bytes / 1024 / 1024).toFixed(1)} MB · ` : ""}enviada em {formatDate(photo.created_at)}
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="e-title">Nome</label>
            <input id="e-title" className="field" value={form.title} onChange={set("title")} maxLength={160} />
          </div>
          <div>
            <label className="label" htmlFor="e-desc">Descrição</label>
            <textarea id="e-desc" className="field" value={form.description} onChange={set("description")} maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="e-price">Preço (R$)</label>
              <input id="e-price" className="field" inputMode="decimal" value={form.price} onChange={set("price")} />
            </div>
            <div>
              <label className="label" htmlFor="e-vis">Visibilidade</label>
              <select id="e-vis" className="field" value={form.visibility} onChange={set("visibility")}>
                <option value="public">Visível</option>
                <option value="hidden">Oculta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="e-event">Evento</label>
            <select id="e-event" className="field" value={form.event_id} onChange={set("event_id")}>
              <option value="">Sem evento</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="e-mod">Modalidade</label>
            <select id="e-mod" className="field" value={form.modality_id} onChange={set("modality_id")}>
              <option value="">Sem modalidade</option>
              {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <button className="btn btn-primary flex-1" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="btn btn-glass" onClick={reprocess} disabled={saving} title="Regenerar prévia">
            <IconRefresh className="size-4" />
          </button>
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={saving} aria-label="Excluir">
            <IconTrash className="size-4" />
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
