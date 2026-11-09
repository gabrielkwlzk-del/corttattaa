import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="conteudo">{children}</main>
      <Footer />
    </>
  );
}
