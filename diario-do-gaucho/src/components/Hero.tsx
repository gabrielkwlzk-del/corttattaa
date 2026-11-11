"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { IconArrowDown, IconShield } from "./Icons";
import { previewUrl, thumbUrl } from "./media";

interface Slide {
  id: string;
  version: number;
  title: string;
  event_name: string | null;
}

const TITLE_WORDS = ["Cada", "momento", "merece", "ser", "lembrado."];
const EASE = [0.32, 0.72, 0, 1] as const;

export function Hero({ slides, stats }: { slides: Slide[]; stats: { photos: number; events: number } }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "16%"]);
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  useEffect(() => {
    if (slides.length < 2 || reduce) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length, reduce]);

  const current = slides[index];
  const strip = slides.slice(0, 5);

  return (
    <section
      ref={ref}
      className="grain relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden"
      aria-label="Destaque"
    >
      {/* Fundo cinematográfico */}
      <motion.div style={{ y }} className="absolute inset-0 -z-10">
        <AnimatePresence mode="sync">
          {current ? (
            <motion.img
              key={current.id}
              src={previewUrl(current.id, current.version)}
              alt=""
              aria-hidden
              draggable={false}
              className="protected-img absolute inset-0 h-full w-full object-cover brightness-[0.8] saturate-[1.08]"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1.14 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 1.4, ease: EASE },
                scale: { duration: 14, ease: "linear" },
              }}
            />
          ) : (
            <div className="absolute inset-0 overflow-hidden bg-ink">
              <div className="aurora absolute -left-1/4 -top-1/3 h-[80vh] w-[80vw] rounded-full bg-[radial-gradient(closest-side,rgba(120,169,255,0.32),transparent)] blur-3xl" />
              <div className="aurora absolute -bottom-1/3 right-[-20%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgba(163,168,178,0.2),transparent)] blur-3xl [animation-delay:-9s]" />
            </div>
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,13,0.7)_0%,rgba(8,9,13,0.05)_32%,rgba(8,9,13,0.35)_62%,#08090D_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,13,0.85)_0%,rgba(8,9,13,0.25)_55%,transparent_100%)] max-md:bg-[linear-gradient(0deg,#08090D_20%,rgba(8,9,13,0.4)_100%)]" />
      </motion.div>

      <motion.div style={{ opacity: fade }} className="mx-auto w-full max-w-7xl px-5 pb-16 pt-36 sm:px-8 sm:pb-20 lg:pb-24">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 120, damping: 20 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-xl"
            >
              <span className="size-1.5 rounded-full bg-sky shadow-[0_0_10px_rgba(120,169,255,0.9)]" />
              Fotografia esportiva
            </motion.p>

            <h1 className="max-w-5xl text-balance text-[clamp(2.75rem,7.2vw,6.25rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              {TITLE_WORDS.map((word, i) => (
                <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.1em] align-bottom">
                  <motion.span
                    className="inline-block"
                    initial={{ y: "110%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.075, duration: 0.9, ease: EASE }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.8, duration: 0.9, ease: EASE }}
              className="mt-7 max-w-xl text-lg leading-relaxed text-white/72 sm:text-xl"
            >
              Encontre os melhores registros dos seus momentos no esporte.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8, ease: EASE }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <a href="#galeria" className="btn btn-primary h-14 px-7 text-base">
                Explorar fotografias
                <IconArrowDown className="size-4" />
              </a>
              <a href="/recuperar" className="btn btn-glass h-14 px-6 text-base">
                Minhas compras
              </a>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25, duration: 0.8 }}
              className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-white/60"
            >
              {stats.photos > 0 && (
                <li>
                  <strong className="font-semibold text-white">{stats.photos.toLocaleString("pt-BR")}</strong> fotografias
                </li>
              )}
              {stats.events > 0 && (
                <li>
                  <strong className="font-semibold text-white">{stats.events}</strong>{" "}
                  {stats.events === 1 ? "evento" : "eventos"}
                </li>
              )}
              <li className="inline-flex items-center gap-2">
                <IconShield className="size-4 text-sky" /> Pix com liberação segura
              </li>
            </motion.ul>
          </div>

          {strip.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.9, ease: EASE }}
              className="hidden lg:block"
              aria-label="Destaques"
            >
              <div className="glass-strong flex gap-2.5 rounded-[26px] p-2.5">
                {strip.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Ver destaque ${i + 1}: ${s.title || "fotografia"}`}
                    aria-current={i === index}
                    className="group relative h-44 w-[88px] overflow-hidden rounded-[18px] transition-all duration-500 [transition-timing-function:var(--ease-apple)] hover:-translate-y-1"
                  >
                    <img
                      src={thumbUrl(s.id, s.version)}
                      alt=""
                      draggable={false}
                      className={`protected-img h-full w-full object-cover transition duration-700 ${i === index ? "scale-105 opacity-100" : "opacity-55 group-hover:opacity-90"}`}
                    />
                    {i === index && (
                      <motion.span
                        layoutId="hero-ring"
                        className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-white/90"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
              {current?.event_name && (
                <p className="mt-3 text-right text-xs text-white/50">{current.event_name}</p>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.a
        href="#galeria"
        aria-label="Rolar para a galeria"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/50 transition hover:text-white md:flex"
      >
        <span className="h-10 w-px overflow-hidden bg-white/15">
          <motion.span
            className="block h-4 w-px bg-white"
            animate={{ y: [0, 40] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.a>
    </section>
  );
}
