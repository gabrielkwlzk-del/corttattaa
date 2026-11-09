"use client";
import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { Logo } from "./Logo";

export function Navbar() {
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setCompact(v > 40));

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(12px,env(safe-area-inset-top))]"
    >
      <nav
        aria-label="Principal"
        className={`glass pointer-events-auto flex w-full max-w-5xl items-center justify-between rounded-full pl-3 pr-2 transition-all duration-500 [transition-timing-function:var(--ease-apple)] ${
          compact ? "h-14 bg-[rgba(14,16,22,0.72)]" : "h-16"
        }`}
      >
        <Link href="/" className="rounded-full px-2 py-1" aria-label="Diário do Gaúcho — início">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/#galeria" className="hidden rounded-full px-4 py-2 text-sm text-white/75 transition hover:text-white sm:block">
            Galeria
          </Link>
          <Link href="/recuperar" className="hidden rounded-full px-4 py-2 text-sm text-white/75 transition hover:text-white sm:block">
            Minhas compras
          </Link>
          <Link href="/#galeria" className="btn btn-primary btn-sm">
            Explorar
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}
