"use client";
import { motion } from "framer-motion";
import { rise, stagger } from "../motion";

export function StatCards({ items }: { items: { label: string; value: string; hint?: string; accent?: boolean }[] }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {items.map((s) => (
        <motion.div key={s.label} variants={rise} className="glass relative overflow-hidden rounded-[26px] p-5">
          {s.accent && <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-sky/20 blur-2xl" />}
          <p className="relative text-sm text-titanium">{s.label}</p>
          <p className="relative mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{s.value}</p>
          {s.hint && <p className="relative mt-1 text-xs text-titanium/80">{s.hint}</p>}
        </motion.div>
      ))}
    </motion.div>
  );
}
