"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconCopy, IconDownload, IconLock, IconPix } from "./Icons";
import { formatDateTime, formatPrice, thumbUrl } from "./media";

type Status = "pending" | "paid" | "expired" | "cancelled";

interface Item {
  id: string;
  photoId: string;
  version: number;
  title: string;
  priceCents: number;
  width: number | null;
  height: number | null;
}

interface Initial {
  status: Status;
  code: string;
  amountCents: number;
  provider: "mercadopago" | "static";
  copiaECola: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  reported: boolean;
  paidAt: string | null;
  items: Item[];
}

export function OrderView({ token, initial }: { token: string; initial: Initial }) {
  const [status, setStatus] = useState<Status>(initial.status);
  const [reported, setReported] = useState(initial.reported);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${token}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status: Status; reported: boolean };
      setStatus(data.status);
      setReported(data.reported);
    } catch {}
  }, [token]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: status === initial.status ? "auto" : "smooth" });
  }, [status, initial.status]);

  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(poll, initial.provider === "mercadopago" ? 4000 : 8000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, poll, initial.provider]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-28 sm:px-6 sm:pt-32">
      <AnimatePresence mode="wait">
        {status === "paid" ? (
          <PaidView key="paid" token={token} initial={initial} />
        ) : status === "pending" ? (
          <PendingView key="pending" token={token} initial={initial} reported={reported} onReported={() => setReported(true)} />
        ) : (
          <motion.div key="closed" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass mx-auto max-w-lg rounded-[32px] p-10 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {status === "expired" ? "Este Pix expirou" : "Pedido cancelado"}
            </h1>
            <p className="mt-3 text-titanium">
              Nenhuma cobrança foi confirmada para o pedido {initial.code}. Se você já pagou, entre em contato informando o código.
            </p>
            <a href="/#galeria" className="btn btn-primary mt-8">Voltar à galeria</a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}:${String(s).padStart(2, "0")}`;
}

function PendingView({ token, initial, reported, onReported }: { token: string; initial: Initial; reported: boolean; onReported: () => void }) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const left = useCountdown(initial.expiresAt);

  async function copy() {
    if (!initial.copiaECola) return;
    try {
      await navigator.clipboard.writeText(initial.copiaECola);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = initial.copiaECola;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  async function report() {
    setSending(true);
    await fetch(`/api/orders/${token}/reported`, { method: "POST" }).catch(() => {});
    setSending(false);
    onReported();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
      transition={{ type: "spring", stiffness: 140, damping: 22 }}
      className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"
    >
      <section className="glass rounded-[32px] p-6 sm:p-8" aria-labelledby="pix-title">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Pedido {initial.code}</p>
          <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-warning" />
            </span>
            Aguardando pagamento
          </span>
        </div>
        <h1 id="pix-title" className="mt-4 text-3xl font-semibold tracking-[-0.035em]">Pague com Pix</h1>
        <p className="mt-2 text-titanium">Escaneie o QR Code no app do seu banco ou use o código copia e cola.</p>

        <div className="mt-6 flex flex-col items-center gap-5">
          {initial.qrSvg ? (
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 180, damping: 20 }}
              className="rounded-[28px] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(120,169,255,0.6)]"
            >
              <div className="size-56 sm:size-64 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR Code Pix" dangerouslySetInnerHTML={{ __html: initial.qrSvg }} />
            </motion.div>
          ) : (
            <div className="grid size-64 place-items-center rounded-[28px] bg-white/5 text-sm text-titanium">QR indisponível</div>
          )}
          <div className="text-center">
            <p className="text-sm text-titanium">Valor</p>
            <p className="text-4xl font-semibold tracking-[-0.04em]">{formatPrice(initial.amountCents)}</p>
            {left && <p className="mt-1 text-xs text-titanium">Expira em {left}</p>}
          </div>
        </div>

        {initial.copiaECola && (
          <div className="mt-6">
            <label htmlFor="copia" className="label">Pix copia e cola</label>
            <div className="flex gap-2">
              <input id="copia" readOnly value={initial.copiaECola} onFocus={(e) => e.currentTarget.select()} className="field truncate font-mono text-xs" />
              <motion.button whileTap={{ scale: 0.94 }} type="button" onClick={copy} className="btn btn-primary h-12 shrink-0 px-4" aria-live="polite">
                {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </motion.button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <div className="glass rounded-[32px] p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight">Como funciona</h2>
          <ol className="mt-4 space-y-4 text-sm">
            {[
              "Abra o app do seu banco e escolha pagar com Pix.",
              "Escaneie o QR Code ou cole o código copia e cola.",
              initial.provider === "mercadopago"
                ? "A confirmação é automática: esta página se atualiza sozinha."
                : "Após a conferência do pagamento pela nossa equipe, esta página se atualiza sozinha.",
              "Baixe o arquivo original em alta resolução, sem marca d'água.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">{i + 1}</span>
                <span className="text-white/80">{t}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 border-t hairline pt-6">
            <AnimatePresence mode="wait" initial={false}>
              {reported ? (
                <motion.p key="ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[18px] bg-sky/10 p-4 text-sm text-sky" role="status">
                  Recebemos seu aviso. A liberação acontece assim que o pagamento for confirmado —
                  {initial.provider === "mercadopago" ? " normalmente em segundos." : " a nossa equipe confere o crédito e libera em seguida."}
                </motion.p>
              ) : (
                <motion.button key="btn" exit={{ opacity: 0 }} type="button" onClick={report} disabled={sending} className="btn btn-glass w-full">
                  {sending ? "Enviando…" : "Já paguei"}
                </motion.button>
              )}
            </AnimatePresence>
            <p className="mt-3 flex items-start gap-2 text-xs text-titanium">
              <IconLock className="mt-0.5 size-3.5 shrink-0" />
              Por segurança, o arquivo só é liberado após a confirmação real do pagamento no servidor.
            </p>
          </div>
        </div>

        <ItemsList items={initial.items} />
        <SaveLink />
      </section>
    </motion.div>
  );
}

function ItemsList({ items, token, paid }: { items: Item[]; token?: string; paid?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <motion.li
          key={it.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + i * 0.06, type: "spring", stiffness: 160, damping: 22 }}
          className="glass flex items-center gap-4 rounded-[24px] p-3 pr-4"
        >
          <img src={thumbUrl(it.photoId, it.version)} alt="" className="protected-img size-16 shrink-0 rounded-[16px] object-cover" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{it.title || "Fotografia"}</p>
            <p className="text-xs text-titanium">
              {it.width && it.height ? `${it.width} × ${it.height}px · ` : ""}
              {formatPrice(it.priceCents)}
            </p>
          </div>
          {paid && token && (
            <a href={`/api/orders/${token}/download/${it.id}`} className="btn btn-primary btn-sm" rel="noreferrer">
              <IconDownload className="size-4" /> Baixar
            </a>
          )}
        </motion.li>
      ))}
    </ul>
  );
}

function SaveLink() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[24px] border border-white/[0.07] p-4 text-sm text-titanium">
      <p>
        <strong className="text-white">Guarde este link.</strong> Ele é a sua chave de acesso para recuperar a compra a qualquer momento.
      </p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(window.location.href).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-3 inline-flex items-center gap-1.5 text-sky hover:underline"
      >
        {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
        {copied ? "Link copiado" : "Copiar link do pedido"}
      </button>
    </div>
  );
}

function PaidView({ token, initial }: { token: string; initial: Initial }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-2xl">
      <div className="relative flex flex-col items-center text-center">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(95,211,154,0.35),transparent)] blur-2xl"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.32, 0.72, 0, 1] }}
        />
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
          className="relative grid size-24 place-items-center rounded-full bg-gradient-to-b from-[#7ee2b0] to-[#3fbf82] shadow-[0_20px_60px_-15px_rgba(95,211,154,0.8)]"
        >
          <svg viewBox="0 0 52 52" className="size-12" fill="none" stroke="#06140d" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M14 27l8 8 16-17" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.55, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 140, damping: 20 }}
          className="mt-8 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl"
        >
          Pagamento aprovado.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.72, type: "spring", stiffness: 140, damping: 20 }}
          className="mt-3 max-w-md text-titanium"
        >
          Obrigado! Seu momento já é seu. Baixe o arquivo original em alta resolução, sem marca d&apos;água.
        </motion.p>
        <p className="mt-2 text-xs text-titanium/70">
          Pedido {initial.code}
          {initial.paidAt ? ` · confirmado em ${formatDateTime(initial.paidAt)}` : ""}
        </p>
      </div>

      <div className="mt-10">
        <ItemsList items={initial.items} token={token} paid />
      </div>
      <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs text-titanium">
        <IconLock className="mt-0.5 size-3.5 shrink-0" /> Cada download gera um link seguro e temporário.
      </p>
      <div className="mt-8">
        <SaveLink />
      </div>
      <div className="mt-8 flex justify-center">
        <a href="/#galeria" className="btn btn-glass">
          <IconPix className="size-4" /> Continuar explorando
        </a>
      </div>
    </motion.div>
  );
}
