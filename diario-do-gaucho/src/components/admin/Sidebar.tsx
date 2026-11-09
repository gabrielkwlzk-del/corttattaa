"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconImage, IconLogout, IconReceipt, IconSettings, IconStar, IconTag, IconUpload } from "../Icons";
import { Logo } from "../Logo";

const NAV = [
  { href: "/admin", label: "Visão geral", icon: IconGrid },
  { href: "/admin/fotos", label: "Fotografias", icon: IconImage },
  { href: "/admin/enviar", label: "Enviar fotos", icon: IconUpload },
  { href: "/admin/eventos", label: "Eventos", icon: IconTag },
  { href: "/admin/pedidos", label: "Pedidos", icon: IconReceipt },
  { href: "/admin/vendidas", label: "Vendidas", icon: IconStar },
  { href: "/admin/configuracoes", label: "Configurações", icon: IconSettings },
];

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/login";
}

export function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[272px] shrink-0 p-4 lg:block">
        <div className="glass flex h-full flex-col rounded-[30px] p-4">
          <Link href="/" className="px-2 py-2"><Logo /></Link>
          <p className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-titanium/70">Painel</p>
          <nav className="mt-2 flex flex-col gap-1" aria-label="Painel administrativo">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm" aria-current={active(n.href) ? "page" : undefined}>
                {active(n.href) && (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-2xl bg-white/[0.09] ring-1 ring-white/10" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
                <n.icon className={`relative size-[18px] ${active(n.href) ? "text-sky" : "text-titanium"}`} />
                <span className={`relative ${active(n.href) ? "text-white" : "text-white/70"}`}>{n.label}</span>
              </Link>
            ))}
          </nav>
          <button type="button" onClick={logout} className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">
            <IconLogout className="size-[18px] text-titanium" /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-40 px-3 pt-[max(10px,env(safe-area-inset-top))] lg:hidden">
        <div className="glass rounded-[24px] p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <Logo />
            <button type="button" onClick={logout} className="btn btn-glass btn-sm" aria-label="Sair">
              <IconLogout className="size-4" />
            </button>
          </div>
          <nav className="scrollbar-none mt-1 flex gap-1 overflow-x-auto" aria-label="Painel administrativo">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="chip shrink-0" data-active={active(n.href)}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
