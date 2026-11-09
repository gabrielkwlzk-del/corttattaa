import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatDateTime, formatPrice } from "@/components/media";
import { expireStaleOrders } from "@/lib/services/orders";
import { listOrders } from "@/lib/services/stats";

export const metadata = { title: "Pedidos" };

const TABS = [
  { v: "", label: "Todos" },
  { v: "pending", label: "Aguardando" },
  { v: "paid", label: "Pagos" },
  { v: "expired", label: "Expirados" },
  { v: "cancelled", label: "Cancelados" },
];

type SP = Promise<Record<string, string | undefined>>;

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await expireStaleOrders();
  const page = Math.max(1, Number(sp.pagina ?? 1) || 1);
  const { orders, hasMore } = await listOrders({ status: sp.status, q: sp.q, page });
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, q: sp.q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, String(v)));
    return `?${p}`;
  };

  return (
    <>
      <PageHeader eyebrow="Vendas" title="Pedidos" description="Acompanhe status de pagamento e confirme Pix estáticos após conferir o extrato." />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <Link key={t.v} href={qs({ status: t.v || undefined, pagina: undefined })} className="chip" data-active={(sp.status ?? "") === t.v}>
              {t.label}
            </Link>
          ))}
        </div>
        <form className="md:w-80">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Código, e-mail ou nome" className="field h-11 rounded-full" aria-label="Buscar pedidos" />
        </form>
      </div>

      <Card className="p-0 sm:p-0">
        {orders.length === 0 ? (
          <p className="py-16 text-center text-titanium">Nenhum pedido encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-titanium">
                <tr className="border-b hairline">
                  <th className="px-5 py-4 font-medium">Pedido</th>
                  <th className="px-5 py-4 font-medium">Cliente</th>
                  <th className="px-5 py-4 font-medium">Itens</th>
                  <th className="px-5 py-4 font-medium">Valor</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b hairline transition last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <Link href={`/admin/pedidos/${o.id}`} className="font-medium text-white hover:text-sky">{o.code}</Link>
                      <p className="text-xs text-titanium">{o.payment_provider === "mercadopago" ? "Mercado Pago" : "Pix estático"}</p>
                    </td>
                    <td className="max-w-[220px] px-5 py-4">
                      <p className="truncate">{o.customer_name ?? "—"}</p>
                      <p className="truncate text-xs text-titanium">{o.customer_email}</p>
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-4 text-titanium">{o.titles}</td>
                    <td className="px-5 py-4 font-medium">{formatPrice(o.amount_cents)}</td>
                    <td className="px-5 py-4"><StatusBadge status={o.status} reported={Boolean(o.customer_reported_paid_at)} /></td>
                    <td className="px-5 py-4 text-titanium">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-6 flex justify-center gap-2">
        {page > 1 && <Link className="btn btn-glass btn-sm" href={qs({ pagina: page - 1 })}>Anterior</Link>}
        {hasMore && <Link className="btn btn-glass btn-sm" href={qs({ pagina: page + 1 })}>Próxima</Link>}
      </div>
    </>
  );
}
