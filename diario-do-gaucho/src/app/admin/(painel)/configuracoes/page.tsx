import { SettingsForms } from "@/components/admin/SettingsForms";
import { Card, PageHeader } from "@/components/admin/ui";
import { env } from "@/lib/env";
import { centsToInput } from "@/lib/money";
import { activePixMode, receiverKey } from "@/lib/pix";
import { getDefaultPriceCents } from "@/lib/services/settings";

export const metadata = { title: "Configurações" };

function mask(key: string) {
  return key.length <= 6 ? key : `${key.slice(0, 5)}••••${key.slice(-3)}`;
}

export default async function SettingsPage() {
  const price = await getDefaultPriceCents();
  const mode = activePixMode();
  let key: string | null = null;
  try {
    key = receiverKey()?.key ?? null;
  } catch {}

  const rows: [string, string][] = [
    ["Modo ativo", mode === "mercadopago" ? "Mercado Pago (cobrança dinâmica + webhook)" : mode === "static" ? "Pix estático (confirmação manual)" : "Não configurado"],
    ["Chave Pix do recebedor", key ? mask(key) : "Não definida (PIX_KEY)"],
    ["Nome do recebedor", env.pixMerchantName ?? "Não definido (PIX_MERCHANT_NAME)"],
    ["Cidade do recebedor", env.pixMerchantCity ?? "Não definida (PIX_MERCHANT_CITY)"],
    ["URL do webhook", `${env.appUrl}/api/webhooks/mercadopago`],
    ["Segredo do webhook", env.mercadoPagoWebhookSecret ? "Configurado" : "Não configurado"],
    ["Armazenamento", env.storageDriver === "supabase" ? "Supabase Storage (privado)" : "Disco local (privado)"],
  ];

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" />
      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsForms defaultPrice={centsToInput(price)} />
        <Card className="h-fit">
          <h2 className="font-semibold">Pagamentos Pix</h2>
          <p className="mt-1 text-sm text-titanium">Definidos por variáveis de ambiente no servidor — nunca no código ou no navegador.</p>
          <dl className="mt-5 space-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-titanium">{k}</dt>
                <dd className="break-all sm:text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
