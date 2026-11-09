import Link from "next/link";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { StatCards } from "@/components/admin/StatCards";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatDateTime, formatPrice } from "@/components/media";
import { activePixMode } from "@/lib/pix";
import { expireStaleOrders } from "@/lib/services/orders";
import { dashboardStats, listOrders } from "@/lib/services/stats";

export const metadata = { title: "Visão geral" };

export default async function Dashboard() {
  await expireStaleOrders();
  const [{ totals, daily }, recent] = await Promise.all([dashboardStats(), listOrders({})]);
  const mode = activePixMode();

  return (
    <>
      <PageHeader eyebrow="Visão geral" title="Bom trabalho hoje." description="Vendas, pedidos e acervo em um só lugar.">
        <Link href="/admin/enviar" className="btn btn-primary btn-sm">Enviar fotos</Link>
      </PageHeader>

      {!mode && (
        <div className="mb-6 rounded-[24px] border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          O Pix não está configurado — o checkout está desativado. Veja <Link href="/admin/configuracoes" className="underline">Configurações</Link>.
        </div>
      )}
      {totals.awaiting_review > 0 && (
        <Link href="/admin/pedidos?status=pending" className="mb-6 block rounded-[24px] border border-sky/30 bg-sky/10 p-4 text-sm text-sky">
          {totals.awaiting_review} pedido(s) em que o cliente informou ter pago aguardam conferência →
        </Link>
      )}

      <StatCards
        items={[
          { label: "Faturamento total", value: formatPrice(totals.revenue_cents), hint: `${formatPrice(totals.revenue_30d_cents)} em 30 dias`, accent: true },
          { label: "Pedidos pagos", value: String(totals.paid_orders) },
          { label: "Aguardando pagamento", value: String(totals.pending_orders) },
          { label: "Fotos vendidas", value: String(totals.photos_sold), hint: `de ${totals.photos_total} no acervo` },
        ]}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">Faturamento</h2>
          <RevenueChart data={daily} />
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Pedidos recentes</h2>
            <Link href="/admin/pedidos" className="text-sm text-sky">Ver todos</Link>
          </div>
          {recent.orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-titanium">Nenhum pedido ainda.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {recent.orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/pedidos/${o.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:opacity-80">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.code}</p>
                      <p className="truncate text-xs text-titanium">{o.customer_email} · {formatDateTime(o.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium">{formatPrice(o.amount_cents)}</span>
                      <StatusBadge status={o.status} reported={Boolean(o.customer_reported_paid_at)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
