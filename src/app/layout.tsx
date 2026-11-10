import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { CartLink } from "@/components/CartLink";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: { default: "LANIK COLLECTIONS | Quality Fashion · Fragrance · Lifestyle", template: "%s | LANIK COLLECTIONS" },
  description: "Perfumes, boxers, singlets, polo shirts, jeans and more. Wholesale & retail. Quality deals at affordable prices.",
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  const wa = s?.whatsapp?.replace(/\D/g, "");
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <div className="bg-ink text-gold-light text-center text-xs tracking-widest py-2 uppercase">Wholesale &amp; Retail · Quality deals at affordable prices</div>
        <header className="bg-ivory/95 backdrop-blur sticky top-0 z-30 border-b border-champagne">
          <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
            <Link href="/" aria-label="LANIK COLLECTIONS home"><Logo size="sm" /></Link>
            <nav className="flex items-center gap-5 text-sm font-semibold tracking-wider uppercase">
              <Link href="/" className="hidden sm:block hover:text-bronze">Home</Link>
              <Link href="/shop" className="hover:text-bronze">Shop</Link>
              <Link href="/#categories" className="hidden sm:block hover:text-bronze">Categories</Link>
              <Link href="/wholesale" className="hidden md:block hover:text-bronze">Wholesale</Link>
              <CartLink />
            </nav>
          </div>
          <form action="/shop" className="mx-auto max-w-6xl px-4 pb-3">
            <input name="q" placeholder="Search perfumes, boxers, polos, jeans…" className="input" aria-label="Search products" />
          </form>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-ink text-champagne mt-16">
          <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 md:grid-cols-3">
            <div><Logo dark /><p className="mt-4 text-sm text-champagne/70">Quality Fashion · Fragrance · Lifestyle</p></div>
            <div className="text-sm space-y-2"><p className="gold-text font-semibold uppercase tracking-widest">Shop</p>
              <Link className="block hover:text-gold-light" href="/shop">All products</Link>
              <Link className="block hover:text-gold-light" href="/wholesale">Wholesale enquiries</Link></div>
            <div className="text-sm space-y-2"><p className="gold-text font-semibold uppercase tracking-widest">Contact</p>
              {wa ? <a className="block hover:text-gold-light" href={`https://wa.me/${wa}`}>WhatsApp us</a> : <p className="text-champagne/60">Add your WhatsApp number in Admin → Settings</p>}
              <p className="text-champagne/60">Payments are processed securely by Flutterwave. We never see or store your card details.</p></div>
          </div>
          <p className="text-center text-xs text-champagne/50 pb-6">© {new Date().getFullYear()} LANIK COLLECTIONS</p>
        </footer>
        {wa && <a href={`https://wa.me/${wa}`} aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-40 btn btn-gold rounded-full shadow-xl">WhatsApp</a>}
      </body>
    </html>
  );
}
