"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { Card } from "./ui";

export function OrderActions({ orderId, status, provider, amount, code }: { orderId: string; status: string; provider: string; amount: string; code: string }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (status === "paid") {
    return (
      <Card className="h-fit">
        <h2 className="font-semibold">Pagamento confirmado</h2>
        <p className="mt-2 text-sm text-titanium">O cliente já tem acesso ao download do original pelo link do pedido.</p>
      </Card>
    );
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ result: string }>(`/api/admin/orders/${orderId}/confirm`, { method: "POST", json: { reference } });
      setMsg(r.result === "paid" || r.result === "already_paid" ? "Pagamento confirmado." : `Resultado: ${r.result}`);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {provider === "static" ? (
        <Card className="h-fit">
          <h2 className="font-semibold">Confirmar pagamento</h2>
          <p className="mt-2 text-sm leading-relaxed text-titanium">
            Pix estático não tem confirmação automática. Antes de confirmar, verifique no extrato do banco um crédito de{" "}
            <strong className="text-white">{amount}</strong> com identificador <strong className="text-white">{code}</strong>.
          </p>
          <form onSubmit={confirm} className="mt-4 space-y-3">
            <div>
              <label htmlFor="ref" className="label">ID da transação (E2E) no extrato</label>
              <input id="ref" className="field font-mono text-sm" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="E00000000202611091234…" required minLength={6} />
            </div>
            <label className="flex items-start gap-2 text-sm text-titanium">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 accent-[#78A9FF]" />
              Conferi o crédito no extrato e o valor está correto.
            </label>
            <button className="btn btn-sky w-full" disabled={busy || !checked || reference.trim().length < 6}>
              {busy ? "Confirmando…" : "Confirmar e liberar download"}
            </button>
          </form>
          {msg && <p className="mt-3 text-sm" role="status">{msg}</p>}
        </Card>
      ) : (
        <Card className="h-fit">
          <h2 className="font-semibold">Confirmação automática</h2>
          <p className="mt-2 text-sm text-titanium">
            Este pedido é confirmado pelo provedor (webhook assinado + consulta à API). Não é possível marcá-lo como pago manualmente.
          </p>
        </Card>
      )}
      {status === "pending" && (
        <Card className="h-fit">
          <button
            type="button"
            className="btn btn-danger w-full"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Cancelar este pedido?")) return;
              setBusy(true);
              await api(`/api/admin/orders/${orderId}/cancel`, { method: "POST" }).catch(() => {});
              router.refresh();
              setBusy(false);
            }}
          >
            Cancelar pedido
          </button>
        </Card>
      )}
    </div>
  );
}
