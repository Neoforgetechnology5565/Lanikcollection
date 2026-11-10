// Stylised gold-on-black product illustrations used until real photography is uploaded.
const KIND: Record<string, string> = { perfumes: "perfume", boxers: "boxers", singlets: "singlet", "polo-shirts": "polo", jeans: "jeans" };
export const artKind = (slug?: string | null) => KIND[slug ?? ""] ?? "gift";

const palettes = [["#1a130b", "#3a2610"], ["#0f0d0a", "#2b1d0d"], ["#17110a", "#4a3015"], ["#0B0907", "#33220f"]];

export function ProductArt({ kind, seed = 0, className = "" }: { kind: string; seed?: number; className?: string }) {
  const [a, b] = palettes[seed % palettes.length];
  const id = `g${kind}${seed}`;
  const stroke = `url(#${id}s)`;
  const common = { fill: "rgba(245,196,94,.07)", stroke, strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 200 250" className={`w-full h-full ${className}`} role="img" aria-label={`${kind} illustration`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F5C45E" /><stop offset=".6" stopColor="#D99A24" /><stop offset="1" stopColor="#A66A25" /></linearGradient>
        <radialGradient id={`${id}glow`} cx=".5" cy=".55" r=".55"><stop offset="0" stopColor="#D99A24" stopOpacity=".28" /><stop offset="1" stopColor="#D99A24" stopOpacity="0" /></radialGradient>
        <pattern id={`${id}dots`} width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".9" fill="#F5C45E" opacity=".12" /></pattern>
      </defs>
      <rect width="200" height="250" fill={`url(#${id}bg)`} />
      <rect width="200" height="250" fill={`url(#${id}dots)`} />
      <rect width="200" height="250" fill={`url(#${id}glow)`} />
      <g transform="translate(0,6)">
        {kind === "perfume" && <g>
          <rect x="82" y="34" width="36" height="26" rx="4" {...common} /><rect x="93" y="60" width="14" height="12" {...common} />
          <rect x="52" y="72" width="96" height="136" rx="16" {...common} /><rect x="70" y="112" width="60" height="58" rx="3" fill="none" stroke={stroke} strokeWidth="1.2" />
          <text x="100" y="152" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="34" fill={stroke}>L</text>
          <path d="M64 92 v90" stroke="#F5C45E" strokeOpacity=".35" strokeWidth="3" />
        </g>}
        {kind === "boxers" && <g>
          <path d="M46 72 H154 V94 H46 Z" {...common} />
          <path d="M46 94 H154 L160 176 Q160 204 136 204 Q112 204 108 164 L100 144 L92 164 Q88 204 64 204 Q40 204 40 176 Z" {...common} />
          <path d="M60 83 H140" stroke="#F5C45E" strokeOpacity=".5" strokeDasharray="3 4" />
        </g>}
        {kind === "singlet" && <g>
          <path d="M72 32 Q72 74 100 82 Q128 74 128 32 L150 32 L150 58 Q150 88 140 104 L140 214 L60 214 L60 104 Q50 88 50 58 L50 32 Z" {...common} />
          <path d="M60 196 H140" stroke="#F5C45E" strokeOpacity=".4" strokeDasharray="3 4" />
        </g>}
        {kind === "polo" && <g>
          <path d="M60 44 L86 30 Q100 48 114 30 L140 44 L176 80 L156 102 L140 88 L140 212 L60 212 L60 88 L44 102 L24 80 Z" {...common} />
          <path d="M86 30 L100 58 L114 30" fill="none" stroke={stroke} strokeWidth="2.2" /><path d="M100 58 V100" stroke={stroke} strokeWidth="1.6" />
          <circle cx="100" cy="72" r="2.4" fill={stroke} /><circle cx="100" cy="88" r="2.4" fill={stroke} />
        </g>}
        {kind === "jeans" && <g>
          <path d="M56 32 H144 V52 H56 Z" {...common} />
          <path d="M56 52 H144 L152 220 H108 L100 108 L92 220 H48 Z" {...common} />
          <path d="M100 52 V108" stroke={stroke} strokeWidth="1.4" /><path d="M62 56 Q74 76 90 70" fill="none" stroke="#F5C45E" strokeOpacity=".6" strokeDasharray="3 3" />
          <path d="M138 56 Q126 76 110 70" fill="none" stroke="#F5C45E" strokeOpacity=".6" strokeDasharray="3 3" />
        </g>}
        {kind === "gift" && <g>
          <rect x="48" y="96" width="104" height="104" {...common} /><rect x="42" y="74" width="116" height="26" {...common} />
          <rect x="93" y="74" width="14" height="126" fill="rgba(245,196,94,.25)" stroke={stroke} strokeWidth="1.6" />
          <path d="M100 74 Q78 40 64 58 Q60 74 100 74 Q140 74 136 58 Q122 40 100 74Z" {...common} />
        </g>}
      </g>
    </svg>
  );
}
