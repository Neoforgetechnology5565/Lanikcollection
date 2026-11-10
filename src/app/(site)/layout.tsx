import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Header } from "@/components/Header";
import { Newsletter } from "@/components/Newsletter";
import { WishlistSync } from "@/components/WishlistSync";
import { getSettings } from "@/lib/settings";
import { getContent, safeHref } from "@/lib/content";
import { getCustomerId } from "@/lib/session";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, c, cats, cid] = await Promise.all([
    getSettings().catch(() => null), getContent(), db.select().from(schema.categories).orderBy(schema.categories.sort), getCustomerId(),
  ]);
  const wa = s?.whatsapp?.replace(/\D/g, "");
  const socials = Object.entries(c.socials).filter(([, v]) => v);
  return (
    <>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-gold focus:p-3">Skip to content</a>
        <Header cats={cats.map((x) => ({ slug: x.slug, name: x.name }))} signedIn={!!cid} announcement={c.announcement} />
        <WishlistSync signedIn={!!cid} />
        <main id="main" className="flex-1">{children}</main>
        <footer className="bg-ink text-champagne mt-24 grain">
          <div className="rule" />
          <div className="mx-auto max-w-7xl px-4 py-16 grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4 space-y-5"><Logo dark /><p className="text-sm text-champagne/70 max-w-xs">Quality fashion, fragrance and lifestyle essentials. Wholesale and retail, at prices that make sense.</p>
              <div><p className="eyebrow !text-gold-light mb-3">Join the list</p><Newsletter dark /></div></div>
            <div className="md:col-span-2 text-sm space-y-2.5"><p className="eyebrow !text-gold-light">Shop</p>
              {cats.map((x) => <Link key={x.id} className="block text-champagne/75 hover:text-gold-light" href={`/shop?cat=${x.slug}`}>{x.name}</Link>)}</div>
            <div className="md:col-span-3 text-sm space-y-2.5"><p className="eyebrow !text-gold-light">Help</p>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/about">About us</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/contact">Contact</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/track">Track your order</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/wholesale">Wholesale enquiries</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/account">My account</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/wishlist">Wishlist</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/pages/shipping-returns">Shipping &amp; returns</Link>
              <Link className="block text-champagne/75 hover:text-gold-light" href="/pages/faq">FAQ</Link></div>
            <div className="md:col-span-3 text-sm space-y-2.5"><p className="eyebrow !text-gold-light">Contact</p>
              {wa && <a className="block text-champagne/75 hover:text-gold-light" href={`https://wa.me/${wa}`}>WhatsApp: +{wa}</a>}
              {c.contact.phone && <a className="block text-champagne/75 hover:text-gold-light" href={`tel:${c.contact.phone}`}>{c.contact.phone}</a>}
              {c.contact.email && <a className="block text-champagne/75 hover:text-gold-light" href={`mailto:${c.contact.email}`}>{c.contact.email}</a>}
              {c.contact.address && <p className="text-champagne/75">{c.contact.address}</p>}
              {c.contact.hours && <p className="text-champagne/50">{c.contact.hours}</p>}
              {socials.length > 0 && <div className="flex gap-4 pt-2">{socials.map(([k, v]) => <a key={k} href={safeHref(v)} rel="noopener noreferrer" target="_blank" className="capitalize text-champagne/75 hover:text-gold-light">{k}</a>)}</div>}
            </div>
          </div>
          <div className="border-t border-white/10 py-5 px-4 text-xs text-champagne/50 flex flex-wrap gap-x-6 gap-y-1 justify-between mx-auto max-w-7xl">
            <span>© {new Date().getFullYear()} LANIK COLLECTIONS. All rights reserved.</span>
            <span><Link href="/pages/privacy" className="hover:text-gold-light">Privacy</Link> · <Link href="/pages/terms" className="hover:text-gold-light">Terms</Link> · Payments secured by Flutterwave. We never see or store your card details.</span>
          </div>
        </footer>
        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-xl flex items-center justify-center hover:scale-105 transition">
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor"><path d="M16 3C9 3 3.4 8.6 3.4 15.5c0 2.3.6 4.400 1.700 6.300L3 29l7.400-2c1.800 1 3.800 1.500 5.600 1.500 7 0 12.600-5.600 12.600-12.500C28.600 8.600 23 3 16 3zm0 22.900c-1.800 0-3.500-.5-5-1.400l-.4-.2-4.400 1.200 1.200-4.300-.3-.4a10.300 10.300 0 01-1.600-5.500C5.500 9.700 10.200 5.100 16 5.100s10.500 4.600 10.500 10.300S21.800 25.900 16 25.900zm5.700-7.700c-.3-.2-1.900-.9-2.200-1s-.5-.2-.7.200-.8 1-1 1.200-.4.200-.7.100a8.400 8.400 0 01-4.200-3.700c-.3-.6.300-.5.900-1.700.1-.2 0-.4 0-.5l-1-2.300c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.100-.9.400s-1.200 1.200-1.200 2.900 1.200 3.3 1.400 3.500 2.400 3.700 5.800 5.100c2.100.9 2.900.9 3.900.8.600-.1 1.900-.8 2.200-1.500s.3-1.400.2-1.500-.3-.2-.6-.4z" /></svg></a>}
    </>
  );
}
