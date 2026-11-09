"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrowRight } from "./Icons";

export function CheckoutForm({ photoId }: { photoId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Apenas o ID da foto é enviado — o preço é calculado no servidor.
        body: JSON.stringify({ photoIds: [photoId], email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível criar o pedido.");
      router.push(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">E-mail</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="name" className="label">Nome <span className="text-titanium/60">(opcional)</span></label>
        <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="field" />
      </div>
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="text-sm text-danger">
          {error}
        </motion.p>
      )}
      <button type="submit" className="btn btn-sky h-14 w-full text-base" disabled={loading}>
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> Gerando Pix…
          </span>
        ) : (
          <>
            Pagar com Pix <IconArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
