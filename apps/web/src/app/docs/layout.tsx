import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
