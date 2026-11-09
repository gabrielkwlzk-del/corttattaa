import { Sidebar } from "@/components/admin/Sidebar";
import { requireAdminPage } from "@/lib/http";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Painel", template: "%s · Painel" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-[100dvh] lg:flex">
      <Sidebar />
      <main id="conteudo" className="min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
