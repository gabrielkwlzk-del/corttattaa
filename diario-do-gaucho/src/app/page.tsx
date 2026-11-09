import { Gallery } from "@/components/Gallery";
import { Hero } from "@/components/Hero";
import { PublicShell } from "@/components/PublicShell";
import { getPublicPhoto, listEvents, listFeaturedPhotos, listModalities, listPublicPhotos } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = { q: one(sp.q), evento: one(sp.evento), modalidade: one(sp.modalidade), data: one(sp.data) };
  const [featured, events, modalities, list, open] = await Promise.all([
    listFeaturedPhotos(6),
    listEvents(),
    listModalities(),
    listPublicPhotos({ q: filters.q, event: filters.evento, modality: filters.modalidade, date: filters.data }),
    one(sp.foto) ? getPublicPhoto(one(sp.foto)) : Promise.resolve(null),
  ]);
  const visibleEvents = events.filter((e) => (e.photo_count ?? 0) > 0);
  const totalPhotos = visibleEvents.reduce((s, e) => s + (e.photo_count ?? 0), 0);

  return (
    <PublicShell>
      <Hero
        slides={featured.map((p) => ({ id: p.id, version: p.version, title: p.title, event_name: p.event_name }))}
        stats={{ photos: Math.max(totalPhotos, list.photos.length), events: visibleEvents.length }}
      />
      <Gallery
        initialPhotos={list.photos}
        initialHasMore={list.hasMore}
        initialFilters={filters}
        initialOpen={open}
        events={visibleEvents}
        modalities={modalities.filter((m) => (m.photo_count ?? 0) > 0)}
      />
    </PublicShell>
  );
}
