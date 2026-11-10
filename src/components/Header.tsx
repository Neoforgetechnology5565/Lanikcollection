"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { naira } from "@/lib/money";
import { Logo } from "./Logo";

type Sug = { id: number; slug: string; name: string; priceKobo: number; saleKobo: number | null };
const I = (d: string) => <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const icons = {
  search: I("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"),
  user: I("M20 21v-1a6 6 0 00-6-6h-4a6 6 0 00-6 6v1M12 11a4 4 0 100-8 4 4 0 000 8z"),
  heart: I("M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5.5 6.2 5.5c1.9 0 3.2 1 3.8 2.1.6-1.1 1.9-2.1 3.8-2.1 3.2 0 5 3.1 3.7 6.3C19.5 16.4 12 21 12 21z"),
  bag: I("M6 7h12l1 13H5L6 7zM9 7a3 3 0 016 0"),
  menu: I("M4 7h16M4 12h16M4 17h16"), close: I("M6 6l12 12M18 6L6 18"),
};
const Badge = ({ n }: { n: number }) => n > 0 ? <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-ink text-[10px] font-bold flex items-center justify-center">{n}</span> : null;

export function Header({ cats, signedIn, announcement }: { cats: { slug: string; name: string }[]; signedIn: boolean; announcement: string }) {
  const router = useRouter();
  const cartN = useCart().reduce((a, i) => a + i.qty, 0);
  const wishN = useWishlist().length;
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState(""); const [sug, setSug] = useState<Sug[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: c.signal }).then((r) => r.json()).then(setSug).catch(() => {}), 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setSearching(false); setOpen(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  useEffect(() => { document.body.style.overflow = open || searching ? "hidden" : ""; }, [open, searching]);

  const go = (e: React.FormEvent) => { e.preventDefault(); setSearching(false); router.push(`/shop?q=${encodeURIComponent(q)}`); };
  const nav = [["Shop", "/shop"], ...cats.slice(0, 4).map((c) => [c.name, `/shop?cat=${c.slug}`]), ["Wholesale", "/wholesale"]];
  return (
    <>
      <div className="bg-ink text-gold-light text-center text-[11px] tracking-[.25em] py-2 uppercase px-2">{announcement}</div>
      <header className={`sticky top-0 z-40 bg-ivory/90 backdrop-blur-md transition-shadow ${scrolled ? "shadow-[0_1px_0_#e9d5b5,0_8px_24px_-16px_rgba(11,9,7,.3)]" : "border-b border-champagne/70"}`}>
        <div className="mx-auto max-w-7xl px-4 h-[68px] grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center gap-2">
            <button className="lg:hidden -ml-2 p-2" aria-label="Open menu" onClick={() => setOpen(true)}>{icons.menu}</button>
            <nav className="hidden lg:flex gap-6 text-[12px] font-semibold tracking-[.18em] uppercase" aria-label="Primary">
              {nav.slice(0, 4).map(([l, h]) => <Link key={h} href={h} className="hover:text-bronze transition relative after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 hover:after:w-full after:bg-gold after:transition-all">{l}</Link>)}
            </nav>
          </div>
          <Link href="/" aria-label="LANIK COLLECTIONS home" className="justify-self-center"><Logo size="md" /></Link>
          <div className="flex items-center justify-end gap-4">
            <nav className="hidden xl:flex gap-6 text-[12px] font-semibold tracking-[.18em] uppercase mr-2">{nav.slice(4).map(([l, h]) => <Link key={h} href={h} className="hover:text-bronze">{l}</Link>)}</nav>
            <button aria-label="Search" onClick={() => setSearching(true)} className="hover:text-bronze">{icons.search}</button>
            <Link aria-label={signedIn ? "My account" : "Sign in"} href={signedIn ? "/account" : "/account/login"} className="hidden sm:block hover:text-bronze">{icons.user}</Link>
            <Link aria-label="Wishlist" href="/wishlist" className="relative hidden sm:block hover:text-bronze">{icons.heart}<Badge n={wishN} /></Link>
            <Link aria-label={`Cart, ${cartN} items`} href="/cart" className="relative hover:text-bronze">{icons.bag}<Badge n={cartN} /></Link>
          </div>
        </div>
      </header>

      {searching && (
        <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm" onClick={() => setSearching(false)}>
          <div className="bg-ivory" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={go} className="mx-auto max-w-3xl px-4 py-6" role="search">
              <div className="flex items-center gap-3 border-b-2 border-gold pb-2">
                {icons.search}
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search perfumes, boxers, polos, jeans…" className="flex-1 bg-transparent text-xl font-serif outline-none" aria-label="Search products" autoComplete="off" />
                <button type="button" aria-label="Close search" onClick={() => setSearching(false)}>{icons.close}</button>
              </div>
              {sug.length > 0 && <ul className="mt-3 divide-y divide-champagne">{sug.map((s) => (
                <li key={s.id}><Link href={`/product/${s.slug}`} onClick={() => setSearching(false)} className="flex justify-between py-3 hover:text-bronze"><span className="font-serif text-lg">{s.name}</span><span className="text-sm">{naira(s.saleKobo && s.saleKobo < s.priceKobo ? s.saleKobo : s.priceKobo)}</span></Link></li>))}
                <li className="pt-3"><button className="text-xs uppercase tracking-widest text-bronze">See all results →</button></li></ul>}
              {q.trim().length >= 2 && sug.length === 0 && <p className="mt-4 text-sm text-ink/60">Press Enter to search for “{q}”.</p>}
            </form>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[84%] max-w-sm bg-ink text-champagne p-6 flex flex-col">
            <div className="flex items-center justify-between"><Logo dark size="sm" /><button aria-label="Close menu" onClick={() => setOpen(false)}>{icons.close}</button></div>
            <nav className="mt-8 flex flex-col gap-1 font-serif text-2xl">
              {[["Home", "/"], ...nav, ["Wishlist", "/wishlist"], [signedIn ? "My account" : "Sign in", signedIn ? "/account" : "/account/login"], ["Track order", "/track"]].map(([l, h]) =>
                <Link key={l + h} href={h} onClick={() => setOpen(false)} className="py-2.5 border-b border-white/10 hover:text-gold-light">{l}</Link>)}
            </nav>
            <p className="mt-auto text-xs text-champagne/50 tracking-widest uppercase">Quality Fashion · Fragrance · Lifestyle</p>
          </div>
        </div>
      )}
    </>
  );
}
