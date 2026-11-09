import Link from "next/link";
import { after } from "next/server";
import { processPending } from "@/lib/services/photos";
import { PhotoManager } from "@/components/admin/PhotoManager";
import { PageHeader } from "@/components/admin/ui";
import { listAdminPhotos, listEvents, listModalities } from "@/lib/services/catalog";

export const metadata = { title: "Fotografias" };

type SP = Promise<Record<string, string | undefined>>;

export default async function PhotosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = sp.status === "processing" || sp.status === "failed" || sp.status === "ready" ? sp.status : undefined;
  const visibility = sp.visibilidade === "hidden" || sp.visibilidade === "public" ? sp.visibilidade : undefined;
  const page = Math.max(1, Number(sp.pagina ?? 1) || 1);
  // Retoma fotos que ficaram presas em "processando" (ex.: reinício do servidor).
  after(() => processPending(5, 120).catch(() => {}));
  const [list, events, modalities] = await Promise.all([
    listAdminPhotos({ q: sp.q, eventId: sp.evento, status, visibility, page, pageSize: 60 }),
    listEvents(),
    listModalities(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Acervo" title="Fotografias" description="Edite preços, nomes e descrições, organize por evento e controle a visibilidade.">
        <Link href="/admin/enviar" className="btn btn-primary btn-sm">Enviar fotos</Link>
      </PageHeader>
      <PhotoManager
        photos={list.photos}
        hasMore={list.hasMore}
        page={page}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        modalities={modalities.map((m) => ({ id: m.id, name: m.name }))}
        filters={{ q: sp.q ?? "", evento: sp.evento ?? "", status: status ?? "", visibilidade: visibility ?? "" }}
      />
    </>
  );
}
