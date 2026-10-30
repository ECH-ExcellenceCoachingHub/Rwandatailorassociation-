import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/**
 * Public marketing site layout.
 *
 * This is the chrome that previously lived in the root layout — the same
 * Navbar and Footer, wrapping the same pages. Moving it into a route group
 * scopes it to the public site so the auth and dashboard areas can have their
 * own shells without touching these pages.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
