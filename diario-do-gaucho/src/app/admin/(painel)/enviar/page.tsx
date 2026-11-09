import { Uploader } from "@/components/admin/Uploader";
import { PageHeader } from "@/components/admin/ui";
import { env } from "@/lib/env";
import { centsToInput } from "@/lib/money";
import { listEvents, listModalities } from "@/lib/services/catalog";
import { getDefaultPriceCents } from "@/lib/services/settings";

export const metadata = { title: "Enviar fotos" };

export default async function UploadPage() {
  const [events, modalities, price] = await Promise.all([listEvents(), listModalities(), getDefaultPriceCents()]);
  return (
    <>
      <PageHeader
        eyebrow="Acervo"
        title="Enviar fotografias"
        description="Envie uma ou centenas de fotos de uma vez. Os originais vão direto para o armazenamento privado; prévias com marca d'água são geradas automaticamente."
      />
      <Uploader
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        modalities={modalities.map((m) => ({ id: m.id, name: m.name }))}
        defaultPrice={centsToInput(price)}
        maxMb={Math.round(env.maxUploadBytes / 1024 / 1024)}
      />
    </>
  );
}
