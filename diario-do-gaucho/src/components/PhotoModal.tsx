"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PublicPhoto } from "@/lib/types";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconClose, IconLock, IconShield } from "./Icons";
import { formatDate, formatPrice, previewUrl, thumbUrl } from "./media";

interface Props {
  photo: PublicPhoto;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function PhotoModal({ photo, onClose, onPrev, onNext }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [hiRes, setHiRes] = useState(false);

  useEffect(() => setHiRes(false), [photo.id]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
      if (e.key === "Tab" && dialog.current) {
        const f = dialog.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose, onPrev, onNext]);

  const ratio = photo.width && photo.height ? photo.width / photo.height : 1.5;
  const meta = [
    photo.event_name && { label: "Evento", value: photo.event_name, wide: true },
    photo.event_date && { label: "Data", value: formatDate(photo.event_date, { day: "2-digit", month: "long", year: "numeric" }), wide: true },
    photo.modality_name && { label: "Modalidade", value: photo.modality_name },
    photo.width && photo.height && { label: "Original", value: `${photo.width} × ${photo.height}px` },
  ].filter(Boolean) as { label: string; value: string; wide?: boolean }[];

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-xl"
      />
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-title"
        tabIndex={-1}
        initial={{ y: 60, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="glass-strong relative flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[32px] outline-none sm:rounded-[32px] lg:flex-row"
      >
        {/* Imagem */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="relative w-full" style={{ aspectRatio: ratio, maxHeight: "72dvh", maxWidth: `calc(72dvh * ${ratio})` }}>
            <motion.img
              layoutId={`photo-${photo.id}`}
              src={thumbUrl(photo.id, photo.version)}
              alt=""
              aria-hidden
              draggable={false}
              className="protected-img absolute inset-0 h-full w-full rounded-[20px] object-contain"
            />
            <img
              src={previewUrl(photo.id, photo.version)}
              alt={photo.title || "Fotografia esportiva"}
              draggable={false}
              onLoad={() => setHiRes(true)}
              onContextMenu={(e) => e.preventDefault()}
              className={`protected-img absolute inset-0 h-full w-full rounded-[20px] object-contain transition-opacity duration-500 ${hiRes ? "opacity-100" : "opacity-0"}`}
            />
          </div>
          {onPrev && (
            <button type="button" onClick={onPrev} aria-label="Foto anterior" className="btn btn-glass absolute left-3 top-1/2 size-11 -translate-y-1/2 p-0 sm:left-5">
              <IconChevronLeft />
            </button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} aria-label="Próxima foto" className="btn btn-glass absolute right-3 top-1/2 size-11 -translate-y-1/2 p-0 sm:right-5 lg:right-5">
              <IconChevronRight />
            </button>
          )}
          <span className="glass absolute bottom-4 left-4 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/80 sm:inline-flex">
            <IconShield className="size-3.5 text-sky" /> Prévia protegida
          </span>
        </div>

        {/* Painel */}
        <aside className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-t hairline p-6 lg:w-[360px] lg:border-l lg:border-t-0 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {photo.event_name && <p className="eyebrow mb-2 truncate">{photo.event_name}</p>}
              <h3 id="photo-title" className="text-2xl font-semibold leading-tight tracking-[-0.03em]">
                {photo.title || "Fotografia esportiva"}
              </h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="btn btn-glass size-10 shrink-0 p-0">
              <IconClose className="size-[18px]" />
            </button>
          </div>

          {photo.description && <p className="text-[15px] leading-relaxed text-white/75">{photo.description}</p>}

          {meta.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-[22px] bg-white/[0.04] p-4 text-sm">
              {meta.map((m) => (
                <div key={m.label} className={`min-w-0 ${m.wide ? "col-span-2" : ""}`}>
                  <dt className="text-xs text-titanium">{m.label}</dt>
                  <dd className="mt-0.5 truncate font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-auto space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-titanium">Valor</span>
              <span className="text-3xl font-semibold tracking-[-0.03em]">{formatPrice(photo.price_cents)}</span>
            </div>
            <Link href={`/comprar/${photo.id}`} className="btn btn-sky h-14 w-full text-base">
              Comprar fotografia <IconArrowRight className="size-4" />
            </Link>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-titanium">
              <IconLock className="mt-0.5 size-3.5 shrink-0" />
              Após a confirmação do Pix você baixa o arquivo original em alta resolução, sem marca d&apos;água.
            </p>
          </div>
        </aside>
      </motion.div>
    </motion.div>
  );
}
