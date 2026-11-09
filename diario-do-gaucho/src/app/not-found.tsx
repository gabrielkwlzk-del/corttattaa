import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";

export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 pt-24 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Página não encontrada.</h1>
        <p className="mt-3 text-titanium">O conteúdo que você procura não existe ou não está mais disponível.</p>
        <Link href="/" className="btn btn-primary mt-8">Voltar ao início</Link>
      </div>
    </PublicShell>
  );
}
