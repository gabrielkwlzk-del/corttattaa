"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { IconArrowDown, IconShield } from "./Icons";
import { previewUrl } from "./media";

interface Slide {
  id: string;
  version: number;
  title: string;
  event_name: string | null;
}

const TITLE = "Cada momento merece ser lembrado.";

export function Hero({ slides, stats }: { slides: Slide[]; stats: { photos: number; events: number } }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  useEffect(() => {
    if (slides.length < 2 || reduce) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, [slides.length, reduce]);

  const current = slides[index];

  return (
    <section ref={ref} className="grain relative isolate flex min-h-[100svh] items-end overflow-hidden" aria-label="Destaque">
      {/* Fundo cinematográfico */}
      <motion.div style={{ y }} className="absolute inset-0 -z-10">
        {current ? (
          <AnimatePresence mode="popLayout">
            <motion.img
              key={current.id}
              src={previewUrl(current.id, current.version)}
              alt=""
              aria-hidden
              draggable={false}
              className="protected-img absolute inset-0 h-full w-full object-cover brightness-[0.82] saturate-[1.1]"
              initial={{ opacity: 0, scale: 1.12 }}
              animate={{ opacity: 1, scale: 1.02 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.6, ease: [0.32, 0.72, 0, 1] }, scale: { duration: 8, ease: "linear" } }}
            />
          </AnimatePresence>
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-ink">
            <div className="aurora absolute -left-1/4 -top-1/3 h-[80vh] w-[80vw] rounded-full bg-[radial-gradient(closest-side,rgba(120,169,255,0.35),transparent)] blur-3xl" />
            <div className="aurora absolute -bottom-1/3 right-[-20%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgba(163,168,178,0.22),transparent)] blur-3xl [animation-delay:-9s]" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <ellipse key={i} cx="600" cy="980" rx={260 + i * 110} ry={170 + i * 72} fill="none" stroke="white" strokeWidth="1" />
              ))}
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,13,0.55)_0%,rgba(8,9,13,0.1)_35%,rgba(8,9,13,0.55)_70%,#08090D_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_120%,transparent_40%,rgba(8,9,13,0.6)_100%)]" />
      </motion.div>

      <motion.div style={{ opacity: fade }} className="mx-auto w-full max-w-6xl px-5 pb-[max(4rem,env(safe-area-inset-bottom))] pt-32 sm:pb-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 120, damping: 20 }}
          className="eyebrow mb-5"
        >
          Fotografia esportiva
        </motion.p>
        <h1 className="text-balance max-w-4xl text-[clamp(2.6rem,8vw,6.2rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
          {TITLE.split(" ").map((word, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span
                className="inline-block"
                initial={{ y: "110%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                transition={{ delay: 0.35 + i * 0.07, type: "spring", stiffness: 110, damping: 18 }}
              >
                {word}&nbsp;
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.85, type: "spring", stiffness: 100, damping: 20 }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl"
        >
          Encontre os melhores registros dos seus momentos no esporte.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, type: "spring", stiffness: 110, damping: 20 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <a href="#galeria" className="btn btn-primary h-14 px-7 text-base">
            Explorar fotografias
            <IconArrowDown className="size-4" />
          </a>
          <a href="/recuperar" className="btn btn-glass h-14 px-6 text-base">
            Minhas compras
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.8 }}
          className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-white/60"
        >
          {stats.photos > 0 && (
            <span>
              <strong className="font-semibold text-white">{stats.photos.toLocaleString("pt-BR")}</strong> fotografias
            </span>
          )}
          {stats.events > 0 && (
            <span>
              <strong className="font-semibold text-white">{stats.events}</strong> {stats.events === 1 ? "evento" : "eventos"}
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            <IconShield className="size-4 text-sky" /> Pagamento via Pix com liberação segura
          </span>
          {current?.event_name && (
            <span className="ml-auto hidden text-xs text-white/45 md:block">Em destaque: {current.event_name}</span>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}
