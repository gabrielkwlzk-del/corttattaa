import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { IconChevronLeft } from "@/components/Icons";
import { formatDateTime, formatPrice } from "@/components/media";
import { orderDetail } from "@/lib/services/stats";

export const metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await orderDetail(id);
  if (!data) notFound();
  const { order, items, transactions } = data;

  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={order.status} reported={Boolean(order.customer_reported_paid_at)} />],
    ["Valor", formatPrice(order.amount_cents)],
    ["Cliente", order.customer_name ?? "—"],
    ["E-mail", order.customer_email ?? "—"],
    ["Pagamento", order.payment_provider === "mercadopago" ? "Pix — Mercado Pago (automático)" : "Pix estático (confirmação manual)"],
    ["ID no provedor", order.provider_payment_id ?? "—"],
    ["Identificador (txid)", order.pix_txid ?? "—"],
    ["Criado em", formatDateTime(order.created_at)],
    ["Vence em", formatDateTime(order.expires_at) || "—"],
    ["Cliente informou pagamento", order.customer_reported_paid_at ? formatDateTime(order.customer_reported_paid_at) : "Não"],
    ["Pago em", order.paid_at ? formatDateTime(order.paid_at) : "—"],
  ];

  return (
    <>
      <Link href="/admin/pedidos" className="mb-4 inline-flex items-center gap-1 text-sm text-titanium hover:text-white">
        <IconChevronLeft className="size-4" /> Pedidos
      </Link>
      <PageHeader eyebrow="Pedido" title={order.code} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-titanium">{k}</dt>
                  <dd className="mt-1 truncate text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Itens</h2>
            <ul className="divide-y divide-white/[0.06]">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="truncate">{i.title_snapshot || "Fotografia"}</span>
                  <span className="shrink-0 text-titanium">{formatPrice(i.price_cents)} · {i.download_count} download(s)</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Transações registradas</h2>
            {transactions.length === 0 ? (
              <p className="text-sm text-titanium">Nenhuma transação recebida ainda.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {transactions.map((t) => (
                  <li key={t.id} className="rounded-[18px] bg-white/[0.04] p-3">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{t.status}</span>
                      <span>{formatPrice(t.amount_cents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-titanium">
                      {t.provider} · {t.source} · {formatDateTime(t.created_at)} · {t.provider_payment_id}
                    </p>
                    {t.note && <p className="mt-1 text-xs text-titanium">{t.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <OrderActions orderId={order.id} status={order.status} provider={order.payment_provider} amount={formatPrice(order.amount_cents)} code={order.code} />
      </div>
    </>
  );
}
