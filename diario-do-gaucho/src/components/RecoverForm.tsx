"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrowRight } from "./Icons";

export function RecoverForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const match = value.trim().match(/(?:pedido\/)?([A-Za-z0-9_-]{40,64})\/?$/);
    if (!match) {
      setError("Link ou código inválido. Verifique e tente novamente.");
      return;
    }
    router.push(`/pedido/${match[1]}`);
  }

  return (
    <form onSubmit={submit} className="glass mt-8 rounded-[28px] p-5">
      <label htmlFor="token" className="label">Link ou código do pedido</label>
      <input
        id="token"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        placeholder="https://…/pedido/…"
        className="field font-mono text-sm"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button className="btn btn-primary mt-4 w-full">
        Acessar pedido <IconArrowRight className="size-4" />
      </button>
    </form>
  );
}
