import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t hairline mt-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-titanium">
            Fotografia esportiva com cuidado editorial. Prévias protegidas por marca d&apos;água; o arquivo original
            em alta resolução é liberado somente após a confirmação do pagamento.
          </p>
        </div>
        <div className="flex gap-12 text-sm">
          <div className="space-y-3">
            <p className="font-medium text-white">Navegar</p>
            <Link className="block text-titanium hover:text-white" href="/#galeria">Galeria</Link>
            <Link className="block text-titanium hover:text-white" href="/recuperar">Recuperar compra</Link>
          </div>
          <div className="space-y-3">
            <p className="font-medium text-white">Pagamento</p>
            <p className="text-titanium">Pix · BRL</p>
            <p className="text-titanium">Liberação segura</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 text-xs text-titanium/70">
        © {new Date().getFullYear()} Diário do Gaúcho. Todos os direitos reservados.
      </div>
    </footer>
  );
}
