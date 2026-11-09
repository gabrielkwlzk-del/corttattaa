import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/CheckoutForm";
import { IconChevronLeft, IconLock, IconPix, IconShield } from "@/components/Icons";
import { formatDate, formatPrice, previewUrl } from "@/components/media";
import { PublicShell } from "@/components/PublicShell";
import { activePixMode } from "@/lib/pix";
import { getPublicPhoto } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finalizar compra", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await getPublicPhoto(id);
  if (!photo) notFound();
  const mode = activePixMode();
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : "3 / 2";

  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-28 sm:px-6 sm:pt-32">
        <Link href={`/?foto=${photo.id}#galeria`} className="mb-8 inline-flex items-center gap-1 text-sm text-titanium hover:text-white">
          <IconChevronLeft className="size-4" /> Voltar à galeria
        </Link>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <section aria-label="Fotografia selecionada">
            <div className="overflow-hidden rounded-[32px] bg-ink-3 ring-1 ring-white/[0.06]">
              <img
                src={previewUrl(photo.id, photo.version)}
                alt={photo.title || "Fotografia esportiva"}
                draggable={false}
                className="protected-img w-full object-cover"
                style={{ aspectRatio: ratio }}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm text-titanium">
              {photo.event_name && <span>{photo.event_name}</span>}
              {photo.modality_name && <span>{photo.modality_name}</span>}
              {photo.event_date && <span>{formatDate(photo.event_date)}</span>}
            </div>
          </section>

          <section className="glass h-fit rounded-[32px] p-6 sm:p-8" aria-labelledby="checkout-title">
            <p className="eyebrow">Checkout</p>
            <h1 id="checkout-title" className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
              {photo.title || "Fotografia esportiva"}
            </h1>

            <div className="mt-6 space-y-3 rounded-[22px] bg-white/[0.04] p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-titanium">Fotografia original em alta resolução</span>
                <span>{formatPrice(photo.price_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-titanium">Formato</span>
                <span>{photo.width && photo.height ? `${photo.width} × ${photo.height}px` : "Original"}</span>
              </div>
              <div className="border-t hairline pt-3 flex items-baseline justify-between">
                <span className="font-medium">Total</span>
                <span className="text-2xl font-semibold tracking-tight">{formatPrice(photo.price_cents)}</span>
              </div>
            </div>

            {mode ? (
              <CheckoutForm photoId={photo.id} />
            ) : (
              <div className="mt-6 rounded-[22px] border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
                Os pagamentos via Pix estão temporariamente indisponíveis. Tente novamente em instantes.
              </div>
            )}

            <ul className="mt-8 space-y-3 text-sm text-titanium">
              <li className="flex gap-3"><IconPix className="size-5 shrink-0 text-sky" /> Pagamento instantâneo via Pix (BRL).</li>
              <li className="flex gap-3"><IconShield className="size-5 shrink-0 text-sky" /> O valor é definido pelo servidor no momento do pedido.</li>
              <li className="flex gap-3"><IconLock className="size-5 shrink-0 text-sky" /> O download do original é liberado somente após a confirmação do pagamento.</li>
            </ul>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
