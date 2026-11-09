import { PublicShell } from "@/components/PublicShell";
import { RecoverForm } from "@/components/RecoverForm";

export const metadata = { title: "Recuperar compra" };

export default function RecoverPage() {
  return (
    <PublicShell>
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 pt-28">
        <p className="eyebrow">Minhas compras</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Recupere sua compra.</h1>
        <p className="mt-3 text-titanium">
          Cole o link do seu pedido (ou o código de acesso que aparece nele) para acessar o status e os downloads.
        </p>
        <RecoverForm />
      </div>
    </PublicShell>
  );
}
