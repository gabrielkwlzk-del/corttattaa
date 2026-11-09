import { notFound } from "next/navigation";
import { OrderView } from "@/components/OrderView";
import { PublicShell } from "@/components/PublicShell";
import { qrSvg } from "@/lib/pix";
import { getOrderByToken, refreshOrderFromProvider } from "@/lib/services/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data = await getOrderByToken(token);
  if (!data) notFound();
  if (data.order.status === "pending") {
    await refreshOrderFromProvider(data.order);
    data = (await getOrderByToken(token))!;
  }
  const { order, items } = data;
  const qr = order.status === "pending" && order.pix_copia_cola ? await qrSvg(order.pix_copia_cola) : null;

  return (
    <PublicShell>
      <OrderView
        token={token}
        initial={{
          status: order.status,
          code: order.code,
          amountCents: order.amount_cents,
          provider: order.payment_provider,
          copiaECola: order.status === "pending" ? order.pix_copia_cola : null,
          qrSvg: qr,
          expiresAt: order.expires_at,
          reported: Boolean(order.customer_reported_paid_at),
          paidAt: order.paid_at,
          items: items.map((i) => ({
            id: i.id,
            photoId: i.photo_id,
            version: i.version,
            title: i.title_snapshot,
            priceCents: i.price_cents,
            width: i.width,
            height: i.height,
          })),
        }}
      />
    </PublicShell>
  );
}
