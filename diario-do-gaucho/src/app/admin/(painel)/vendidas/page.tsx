import { Card, PageHeader } from "@/components/admin/ui";
import { formatDateTime, formatPrice, thumbUrl } from "@/components/media";
import { listSoldPhotos } from "@/lib/services/stats";

export const metadata = { title: "Fotos vendidas" };

export default async function SoldPage() {
  const sold = await listSoldPhotos();
  const total = sold.reduce((s, p) => s + p.revenue_cents, 0);
  return (
    <>
      <PageHeader eyebrow="Vendas" title="Fotos vendidas" description={`${sold.length} fotografia(s) vendidas · ${formatPrice(total)} em receita.`} />
      {sold.length === 0 ? (
        <Card><p className="py-12 text-center text-titanium">Nenhuma venda confirmada ainda.</p></Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sold.map((p) => (
            <li key={p.photo_id} className="glass flex items-center gap-4 rounded-[24px] p-3">
              <img src={thumbUrl(p.photo_id, p.version)} alt="" className="size-20 shrink-0 rounded-[16px] object-cover" />
              <div className="min-w-0">
                <p className="truncate font-medium">{p.title || "Sem título"}</p>
                <p className="text-sm">{p.sales} venda(s) · {formatPrice(p.revenue_cents)}</p>
                <p className="truncate text-xs text-titanium">
                  {p.downloads} download(s) · última {formatDateTime(p.last_sale)}
                  {p.deleted_at ? " · arquivada" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
