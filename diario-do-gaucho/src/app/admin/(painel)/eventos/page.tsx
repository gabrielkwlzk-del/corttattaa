import { EventsManager } from "@/components/admin/EventsManager";
import { PageHeader } from "@/components/admin/ui";
import { listEvents, listModalities } from "@/lib/services/catalog";

export const metadata = { title: "Eventos" };

export default async function EventsPage() {
  const [events, modalities] = await Promise.all([listEvents(), listModalities()]);
  return (
    <>
      <PageHeader eyebrow="Organização" title="Eventos e modalidades" description="Estruture o acervo para facilitar a busca dos atletas." />
      <EventsManager events={events} modalities={modalities} />
    </>
  );
}
