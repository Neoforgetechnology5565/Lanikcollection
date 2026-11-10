"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { ProductArt } from "./ProductArt";

type Slide = { title: string; subtitle: string; cta: string; href: string; kind: string };
export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false);
  useEffect(() => { if (paused || slides.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6500); return () => clearInterval(t); }, [paused, slides.length]);
  return (
    <section className="relative bg-ink text-champagne overflow-hidden grain" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel" aria-label="Featured collections">
      <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(70% 90% at 80% 50%, rgba(217,154,36,.35), transparent 65%), radial-gradient(50% 60% at 10% 100%, rgba(166,106,37,.3), transparent 60%)" }} />
      <div className="relative mx-auto max-w-7xl px-4 grid lg:grid-cols-2 items-center min-h-[560px] lg:min-h-[640px] gap-8 py-14">
        {slides.map((s, n) => n === i && (
          <div key={n} className="contents" aria-live="polite">
            <div className="text-center lg:text-left">
              <p className="eyebrow !text-gold-light fade-up">Lanik Collections</p>
              <h1 className="font-serif font-bold leading-[1.05] text-4xl sm:text-5xl lg:text-6xl mt-4 fade-up d1">{s.title}</h1>
              <p className="mt-5 text-lg text-champagne/80 max-w-md mx-auto lg:mx-0 fade-up d2">{s.subtitle}</p>
              <div className="mt-8 flex gap-3 justify-center lg:justify-start fade-up d3">
                <Link href={s.href} className="btn btn-gold">{s.cta}</Link><Link href="/shop" className="btn btn-dark">All Products</Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-sm fade-up d2">
              <div className="absolute -inset-4 border border-gold/40 translate-x-4 translate-y-4" />
              <div className="relative aspect-[4/5] overflow-hidden border border-gold/50 shadow-[0_30px_80px_-30px_rgba(217,154,36,.6)]"><ProductArt kind={s.kind} seed={n + 1} /></div>
              <div className="absolute -bottom-5 -left-5 bg-ivory text-ink px-4 py-3 shadow-xl hidden sm:block"><Logo size="sm" /></div>
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">{slides.map((_, n) => <button key={n} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i} className={`h-1.5 transition-all ${n === i ? "w-8 bg-gold" : "w-3 bg-champagne/40"}`} />)}</div>}
    </section>
  );
}
