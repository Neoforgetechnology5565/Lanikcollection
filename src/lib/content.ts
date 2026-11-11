import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type Banner = { title: string; subtitle: string; cta: string; href: string };
export type Content = {
  announcement: string;
  banners: Banner[];
  promo: { title: string; body: string; cta: string; href: string; active: boolean };
  contact: { email: string; phone: string; address: string; hours: string };
  socials: { instagram: string; facebook: string; tiktok: string; x: string };
  brand: { logoUrl: string; logoDarkUrl: string; faviconUrl: string }; // empty = built-in text logo / icon
};
export const CONTENT_DEFAULTS: Content = {
  announcement: "Wholesale & Retail · Quality deals at affordable prices",
  banners: [
    { title: "Fragrance that speaks before you do", subtitle: "Discover long-lasting perfumes and gift sets.", cta: "Shop Perfumes", href: "/shop?cat=perfumes" },
    { title: "Everyday essentials, elevated", subtitle: "Boxers, singlets and polos in premium cotton.", cta: "Shop Essentials", href: "/shop?cat=boxers" },
    { title: "Denim that fits like it was made for you", subtitle: "Slim, straight and relaxed cuts.", cta: "Shop Jeans", href: "/shop?cat=jeans" },
  ],
  promo: { title: "Use WELCOME10 for 10% off your first order", body: "Applies to everything in store. Wholesale tiers stack automatically.", cta: "Start shopping", href: "/shop", active: true },
  contact: { email: "", phone: "", address: "", hours: "Mon–Sat, 9am – 6pm" },
  socials: { instagram: "", facebook: "", tiktok: "", x: "" },
  brand: { logoUrl: "", logoDarkUrl: "", faviconUrl: "" },
};

export async function getContent(): Promise<Content> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "content"));
  const v = (row?.value ?? {}) as Partial<Content>;
  return {
    ...CONTENT_DEFAULTS, ...v,
    banners: v.banners?.length ? v.banners : CONTENT_DEFAULTS.banners,
    promo: { ...CONTENT_DEFAULTS.promo, ...(v.promo ?? {}) },
    contact: { ...CONTENT_DEFAULTS.contact, ...(v.contact ?? {}) },
    socials: { ...CONTENT_DEFAULTS.socials, ...(v.socials ?? {}) },
    brand: { ...CONTENT_DEFAULTS.brand, ...(v.brand ?? {}) },
  };
}
export async function saveContent(c: Content) {
  await db.insert(schema.settings).values({ key: "content", value: c }).onConflictDoUpdate({ target: schema.settings.key, set: { value: c } });
}
/** Only allow same-site paths or http(s) links from admin-entered content. */
export const safeHref = (h: string) => (h.startsWith("/") && !h.startsWith("//")) || /^https?:\/\//i.test(h) ? h : "/";
/** Image links from admin content: https or same-site paths only (never javascript:/data:). Empty string if not acceptable. */
export const safeImg = (u: string) => { const v = u.trim(); return /^https:\/\//i.test(v) || (v.startsWith("/") && !v.startsWith("//")) ? v.slice(0, 500) : ""; };
