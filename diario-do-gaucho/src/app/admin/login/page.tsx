import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { Logo } from "@/components/Logo";
import { isAdmin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar — Painel", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <main id="conteudo" className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4">
      <div aria-hidden className="aurora absolute left-1/2 top-1/4 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(120,169,255,0.25),transparent)] blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <LoginForm />
      </div>
    </main>
  );
}
