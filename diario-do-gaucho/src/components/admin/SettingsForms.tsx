"use client";
import { useState } from "react";
import { api } from "./api";
import { Card } from "./ui";

export function SettingsForms({ defaultPrice }: { defaultPrice: string }) {
  const [price, setPrice] = useState(defaultPrice);
  const [priceMsg, setPriceMsg] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-semibold">Preço padrão</h2>
        <p className="mt-1 text-sm text-titanium">Aplicado a novas fotografias. Fotos existentes mantêm o preço individual.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPriceMsg("");
            try {
              await api("/api/admin/settings", { method: "PUT", json: { defaultPrice: price } });
              setPriceMsg("Preço padrão atualizado.");
            } catch (err) {
              setPriceMsg(err instanceof Error ? err.message : "Erro");
            }
          }}
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-titanium">R$</span>
            <input className="field pl-11" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Preço padrão" />
          </div>
          <button className="btn btn-primary">Salvar</button>
        </form>
        {priceMsg && <p className="mt-3 text-sm" role="status">{priceMsg}</p>}
      </Card>

      <Card>
        <h2 className="font-semibold">Alterar senha</h2>
        <p className="mt-1 text-sm text-titanium">Ao trocar, todas as sessões são encerradas.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwMsg("");
            if (pw.next !== pw.confirm) return setPwMsg("As senhas não conferem.");
            try {
              await api("/api/admin/password", { method: "POST", json: { current: pw.current, next: pw.next } });
              window.location.href = "/admin/login";
            } catch (err) {
              setPwMsg(err instanceof Error ? err.message : "Erro");
            }
          }}
        >
          <input type="password" className="field" placeholder="Senha atual" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} aria-label="Senha atual" />
          <input type="password" className="field" placeholder="Nova senha (mín. 10 caracteres)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} aria-label="Nova senha" />
          <input type="password" className="field" placeholder="Confirmar nova senha" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} aria-label="Confirmar nova senha" />
          <button className="btn btn-glass" disabled={!pw.current || !pw.next}>Alterar senha</button>
        </form>
        {pwMsg && <p className="mt-3 text-sm text-danger" role="alert">{pwMsg}</p>}
      </Card>
    </div>
  );
}
