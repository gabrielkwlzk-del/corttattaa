"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { EventRow, ModalityRow, PublicPhoto } from "@/lib/types";
import { IconArrowRight, IconCalendar, IconClose, IconSearch } from "./Icons";
import { formatDate, formatPrice, thumbUrl } from "./media";
import { PhotoModal } from "./PhotoModal";

export interface GalleryFilters {
  q: string;
  evento: string;
  modalidade: string;
  data: string;
}

interface Props {
  initialPhotos: PublicPhoto[];
  initialHasMore: boolean;
  initialFilters: GalleryFilters;
  initialOpen: PublicPhoto | null;
  events: EventRow[];
  modalities: ModalityRow[];
}

function toQuery(f: GalleryFilters, page?: number) {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof GalleryFilters)[]).forEach((k) => f[k] && p.set(k, f[k]));
  if (page && page > 1) p.set("pagina", String(page));
  return p.toString();
}

export function Gallery({ initialPhotos, initialHasMore, initialFilters, initialOpen, events, modalities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState(initialFilters.q);
  const [photos, setPhotos] = useState(initialPhotos);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<PublicPhoto | null>(initialOpen);
  const [, startTransition] = useTransition();
  const first = useRef(true);
  const reqId = useRef(0);

  const load = useCallback(async (f: GalleryFilters, nextPage: number) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?${toQuery(f, nextPage)}`);
      const data = (await res.json()) as { photos: PublicPhoto[]; hasMore: boolean };
      if (id !== reqId.current) return;
      setPhotos((prev) => (nextPage === 1 ? data.photos : [...prev, ...data.photos]));
      setHasMore(data.hasMore);
      setPage(nextPage);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Busca com debounce
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 320);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const qs = toQuery(filters);
    startTransition(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}#galeria`, { scroll: false }));
    load(filters, 1);
  }, [filters, load, pathname, router]);

  // Carregamento contínuo
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) load(filters, page + 1);
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, filters, page, load]);

  // Deep-link ?foto=
  const openPhoto = useCallback((p: PublicPhoto | null) => {
    setOpen(p);
    const url = new URL(window.location.href);
    if (p) url.searchParams.set("foto", p.id);
    else url.searchParams.delete("foto");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const openIndex = open ? photos.findIndex((p) => p.id === open.id) : -1;
  const navigate = (dir: 1 | -1) => {
    if (openIndex < 0) return;
    const next = photos[openIndex + dir];
    if (next) openPhoto(next);
  };

  const activeCount = useMemo(
    () => [filters.evento, filters.modalidade, filters.data, filters.q].filter(Boolean).length,
    [filters],
  );

  const set = (patch: Partial<GalleryFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <section id="galeria" className="relative mx-auto max-w-7xl scroll-mt-24 px-4 pt-20 sm:px-6" aria-labelledby="galeria-titulo">
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Galeria</p>
          <h2 id="galeria-titulo" className="mt-3 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            Encontre o seu momento.
          </h2>
          <p className="mt-3 max-w-lg text-titanium">
            Filtre por evento, modalidade ou data. Toque em uma fotografia para ver em tamanho ampliado.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="glass-strong mb-8 rounded-[28px] p-2.5 sm:p-3 lg:sticky lg:top-[96px] lg:z-30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Pesquisar fotografias</span>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-titanium" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por atleta, evento, número…"
              className="field h-12 rounded-full border-transparent bg-white/[0.06] pl-11"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <label className="sm:w-56">
              <span className="sr-only">Evento</span>
              <select
                value={filters.evento}
                onChange={(e) => set({ evento: e.target.value })}
                className="field h-12 rounded-full border-transparent bg-white/[0.06] text-sm"
              >
                <option value="">Todos os eventos</option>
                {events.map((e) => (
                  <option key={e.id} value={e.slug}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative sm:w-48">
              <span className="sr-only">Data</span>
              <IconCalendar className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-titanium" />
              <input
                type="date"
                value={filters.data}
                onChange={(e) => set({ data: e.target.value })}
                className="field h-12 rounded-full border-transparent bg-white/[0.06] pl-10 text-sm [color-scheme:dark]"
              />
            </label>
          </div>
        </div>
        {modalities.length > 0 && (
          <div className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Modalidades">
            <button type="button" className="chip" data-active={!filters.modalidade} onClick={() => set({ modalidade: "" })}>
              Todas
            </button>
            {modalities.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                data-active={filters.modalidade === m.slug}
                aria-pressed={filters.modalidade === m.slug}
                onClick={() => set({ modalidade: filters.modalidade === m.slug ? "" : m.slug })}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5 flex h-8 items-center justify-between text-sm text-titanium" aria-live="polite">
        <span>
          {loading && page === 1
            ? "Carregando…"
            : `${photos.length}${hasMore ? "+" : ""} fotografia${photos.length === 1 ? "" : "s"}`}
        </span>
        <AnimatePresence>
          {activeCount > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              type="button"
              onClick={() => {
                setSearch("");
                setFilters({ q: "", evento: "", modalidade: "", data: "" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white/80 hover:bg-white/10"
            >
              <IconClose className="size-3.5" /> Limpar filtros
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {photos.length === 0 && !loading ? (
        <EmptyState filtered={activeCount > 0} />
      ) : (
        <motion.ul
          className={`grid grid-cols-2 gap-3 transition-opacity duration-300 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 ${loading && page === 1 ? "opacity-50" : ""}`}
        >
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i % 24} onOpen={() => openPhoto(p)} />
          ))}
        </motion.ul>
      )}

      <div ref={sentinel} className="h-px" />
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button type="button" className="btn btn-glass" disabled={loading} onClick={() => load(filters, page + 1)}>
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <PhotoModal
            key="modal"
            photo={open}
            onClose={() => openPhoto(null)}
            onPrev={openIndex > 0 ? () => navigate(-1) : undefined}
            onNext={openIndex >= 0 && openIndex < photos.length - 1 ? () => navigate(1) : undefined}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function PhotoCard({ photo, index, onOpen }: { photo: PublicPhoto; index: number; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Se a imagem terminou de carregar antes da hidratação, onLoad não dispara.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, []);
  const caption = [photo.event_name, photo.modality_name].filter(Boolean).join(" · ");
  return (
    <motion.li
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 140, damping: 22, delay: (index % 8) * 0.04 }}
      className="min-w-0"
    >
      <motion.button
        type="button"
        onClick={onOpen}
        whileTap={{ scale: 0.985 }}
        className="group relative block w-full overflow-hidden rounded-[22px] bg-ink-3 text-left ring-1 ring-white/[0.07] shadow-[0_18px_44px_-26px_rgba(0,0,0,0.95)] transition-[box-shadow,transform] duration-500 [transition-timing-function:var(--ease-apple)] hover:-translate-y-1 hover:shadow-[0_30px_70px_-24px_rgba(120,169,255,0.28)] sm:rounded-[28px]"
        aria-label={`${photo.title || "Fotografia"}${caption ? ` — ${caption}` : ""}, ${formatPrice(photo.price_cents)}`}
      >
        <div className={`relative aspect-[4/5] w-full overflow-hidden ${loaded ? "" : "skeleton"}`}>
          <img
            ref={imgRef}
            src={thumbUrl(photo.id, photo.version)}
            alt={photo.title || "Fotografia esportiva"}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onContextMenu={(e) => e.preventDefault()}
            className={`protected-img absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-[900ms] [transition-timing-function:var(--ease-apple)] group-hover:scale-[1.05] ${loaded ? "opacity-100" : "opacity-0"}`}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,13,0)_55%,rgba(8,9,13,0.85)_100%)]" />
          <span className="glass absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-tight sm:right-3.5 sm:top-3.5 sm:px-3 sm:text-[13px]">
            {formatPrice(photo.price_cents)}
          </span>
          <span className="absolute inset-x-2.5 bottom-2.5 sm:inset-x-4 sm:bottom-4">
            <span className="block truncate text-[14px] font-semibold leading-tight tracking-[-0.01em] sm:text-[17px]">
              {photo.title || "Fotografia esportiva"}
            </span>
            {caption && (
              <span className="mt-1 block truncate text-[11.5px] text-white/70 sm:text-[13px]">{caption}</span>
            )}
          </span>
          <span
            aria-hidden
            className="absolute bottom-4 right-4 hidden size-10 items-center justify-center rounded-full bg-white text-ink opacity-0 shadow-lg transition-all duration-500 [transition-timing-function:var(--ease-apple)] group-hover:opacity-100 md:flex"
          >
            <IconArrowRight className="size-4" />
          </span>
        </div>
      </motion.button>
    </motion.li>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mx-auto flex max-w-lg flex-col items-center rounded-[32px] px-8 py-16 text-center"
    >
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-white/[0.06]">
        <IconSearch className="size-6 text-titanium" />
      </div>
      <h3 className="text-xl font-semibold tracking-tight">
        {filtered ? "Nenhuma fotografia encontrada" : "As fotografias chegam em breve"}
      </h3>
      <p className="mt-2 text-titanium">
        {filtered
          ? "Tente outro termo, evento ou data."
          : "Estamos preparando os registros dos próximos eventos. Volte em breve."}
      </p>
    </motion.div>
  );
}
