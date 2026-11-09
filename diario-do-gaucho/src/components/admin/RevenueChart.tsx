"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { formatDate, formatPrice } from "../media";

export function RevenueChart({ data }: { data: { day: string; cents: number; orders: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? data[hover] : null;
  const total = data.reduce((s, d) => s + d.cents, 0);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-sm text-titanium">{h ? formatDate(h.day, { day: "2-digit", month: "long" }) : "Últimos 30 dias"}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPrice(h ? h.cents : total)}</p>
        </div>
        <p className="text-sm text-titanium">{h ? `${h.orders} pedido${h.orders === 1 ? "" : "s"}` : ""}</p>
      </div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Faturamento diário dos últimos 30 dias" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (d.cents / max) * 100)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20, delay: i * 0.012 }}
              className={`w-full rounded-full transition-colors ${
                hover === i ? "bg-sky" : d.cents > 0 ? "bg-gradient-to-t from-sky/30 to-sky/80" : "bg-white/[0.07]"
              }`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-titanium/70">
        <span>{data[0] && formatDate(data[0].day, { day: "2-digit", month: "short" })}</span>
        <span>Hoje</span>
      </div>
    </div>
  );
}
