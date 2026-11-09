"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EventRow, ModalityRow } from "@/lib/types";
import { IconTrash } from "../Icons";
import { formatDate } from "../media";
import { api } from "./api";
import { Card } from "./ui";

const emptyEvent = { name: "", event_date: "", location: "", description: "" };

export function EventsManager({ events, modalities }: { events: EventRow[]; modalities: ModalityRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState(emptyEvent);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modName, setModName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      editingId
        ? api(`/api/admin/events/${editingId}`, { method: "PATCH", json: form })
        : api("/api/admin/events", { method: "POST", json: form }),
    );
    if (ok) {
      setForm(emptyEvent);
      setEditingId(null);
    }
  }

  const set = (k: keyof typeof emptyEvent) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold">{editingId ? "Editar evento" : "Novo evento"}</h2>
          <form onSubmit={saveEvent} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ev-name">Nome</label>
              <input id="ev-name" className="field" required value={form.name} onChange={set("name")} placeholder="Maratona de Porto Alegre 2026" />
            </div>
            <div>
              <label className="label" htmlFor="ev-date">Data</label>
              <input id="ev-date" type="date" className="field [color-scheme:dark]" value={form.event_date} onChange={set("event_date")} />
            </div>
            <div>
              <label className="label" htmlFor="ev-loc">Local</label>
              <input id="ev-loc" className="field" value={form.location} onChange={set("location")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ev-desc">Descrição</label>
              <textarea id="ev-desc" className="field" value={form.description} onChange={set("description")} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn btn-primary" disabled={busy}>{editingId ? "Salvar alterações" : "Criar evento"}</button>
              {editingId && (
                <button type="button" className="btn btn-glass" onClick={() => { setEditingId(null); setForm(emptyEvent); }}>Cancelar</button>
              )}
            </div>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Eventos ({events.length})</h2>
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-titanium">Nenhum evento criado.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              <AnimatePresence initial={false}>
                {events.map((ev) => (
                  <motion.li key={ev.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        setEditingId(ev.id);
                        setForm({ name: ev.name, event_date: ev.event_date ?? "", location: ev.location ?? "", description: ev.description ?? "" });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <p className="truncate font-medium">{ev.name}</p>
                      <p className="truncate text-xs text-titanium">
                        {[formatDate(ev.event_date), ev.location, `${ev.photo_count ?? 0} foto(s)`].filter(Boolean).join(" · ")}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${ev.name}`}
                      className="btn btn-glass size-9 shrink-0 p-0"
                      onClick={() => confirm(`Excluir o evento "${ev.name}"? As fotos não serão apagadas, apenas desvinculadas.`) && run(() => api(`/api/admin/events/${ev.id}`, { method: "DELETE" }))}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      </div>

      <Card className="h-fit">
        <h2 className="font-semibold">Modalidades</h2>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("/api/admin/modalities", { method: "POST", json: { name: modName } }))) setModName("");
          }}
        >
          <input className="field" value={modName} onChange={(e) => setModName(e.target.value)} placeholder="Corrida, Ciclismo, Futebol…" aria-label="Nova modalidade" />
          <button className="btn btn-primary shrink-0" disabled={busy || !modName.trim()}>Adicionar</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">
          {modalities.map((m) => (
            <li key={m.id} className="chip gap-2 pr-1.5">
              {m.name}
              <span className="text-titanium">{m.photo_count ?? 0}</span>
              <button
                type="button"
                aria-label={`Excluir ${m.name}`}
                className="grid size-6 place-items-center rounded-full hover:bg-white/10"
                onClick={() => confirm(`Excluir a modalidade "${m.name}"?`) && run(() => api(`/api/admin/modalities/${m.id}`, { method: "DELETE" }))}
              >
                <IconTrash className="size-3" />
              </button>
            </li>
          ))}
          {modalities.length === 0 && <li className="text-sm text-titanium">Nenhuma modalidade.</li>}
        </ul>
      </Card>
    </div>
  );
}
