"use client";
import { motion, useAnimationControls } from "framer-motion";
import { useState } from "react";
import { IconLock } from "../Icons";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controls = useAnimationControls();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/admin";
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Não foi possível entrar.");
    setLoading(false);
    setPassword("");
    controls.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.45 } });
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
      className="glass-strong rounded-[32px] p-7"
    >
      <motion.div animate={controls}>
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-white/[0.07]">
          <IconLock className="size-5 text-sky" />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">Painel administrativo</h1>
        <p className="mt-1 text-center text-sm text-titanium">Acesso restrito</p>
        <label htmlFor="password" className="label mt-7">Senha</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <button className="btn btn-primary mt-6 w-full" disabled={loading || !password}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </motion.div>
    </motion.form>
  );
}
