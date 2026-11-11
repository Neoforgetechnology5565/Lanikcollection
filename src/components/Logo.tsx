export function Logo({ dark = false, size = "md", src }: { dark?: boolean; size?: "sm" | "md" | "lg"; src?: string }) {
  const big = size === "lg", small = size === "sm";
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="LANIK COLLECTIONS" className={`${big ? "h-24" : small ? "h-7" : "h-10"} w-auto max-w-[220px] object-contain`} />;
  return (
    <span className="inline-flex flex-col items-center leading-none select-none">
      <span className={`font-serif font-black tracking-tight ${dark ? "text-champagne" : "text-ink"} ${big ? "text-6xl" : small ? "text-xl" : "text-3xl"}`}>LANIK</span>
      <span className={`font-sans font-bold tracking-[0.42em] ${dark ? "text-gold-light" : "text-bronze"} ${big ? "text-lg mt-2" : small ? "text-[7px] mt-0.5" : "text-[9px] mt-1"}`}>COLLECTIONS</span>
    </span>
  );
}
export function Monogram({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Lanik monogram">
      <rect width="64" height="64" rx="12" fill="#0B0907" />
      <text x="32" y="46" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="42" fill="#D99A24">L</text>
    </svg>
  );
}
