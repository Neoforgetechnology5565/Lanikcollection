import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getContent, saveContent, type Content } from "@/lib/content";

export const dynamic = "force-dynamic";
const t = (fd: FormData, k: string, n = 200) => String(fd.get(k) ?? "").trim().slice(0, n);
async function save(fd: FormData) {
  "use server"; await requireAdmin();
  const cur = await getContent();
  const c: Content = {
    announcement: t(fd, "announcement"),
    banners: cur.banners.map((_, i) => ({ title: t(fd, `b${i}t`, 90), subtitle: t(fd, `b${i}s`, 160), cta: t(fd, `b${i}c`, 30), href: t(fd, `b${i}h`, 200) || "/shop" })).filter((b) => b.title),
    promo: { active: fd.get("pactive") === "on", title: t(fd, "ptitle", 120), body: t(fd, "pbody", 240), cta: t(fd, "pcta", 30), href: t(fd, "phref") || "/shop" },
    contact: { email: t(fd, "email"), phone: t(fd, "phone", 30), address: t(fd, "address", 200), hours: t(fd, "hours", 100) },
    socials: { instagram: t(fd, "instagram"), facebook: t(fd, "facebook"), tiktok: t(fd, "tiktok"), x: t(fd, "x") },
  };
  if (!c.banners.length) c.banners = cur.banners;
  await saveContent(c); revalidatePath("/", "layout");
}
export default async function ContentPage() {
  const c = await getContent();
  const F = ({ n, l, v, w = "" }: { n: string; l: string; v: string; w?: string }) => <div className={w}><label className="label" htmlFor={n}>{l}</label><input id={n} name={n} defaultValue={v} className="input" /></div>;
  return (
    <form action={save} className="space-y-6 max-w-4xl">
      <h1 className="font-serif text-3xl font-bold">Website content</h1>
      <p className="text-sm text-ink/70">Edit the homepage, announcement bar, contact details and social links. No code needed.</p>
      <section className="card p-5 space-y-3"><h2 className="font-semibold">Announcement bar</h2><F n="announcement" l="Text" v={c.announcement} /></section>
      <section className="card p-5 space-y-5"><h2 className="font-semibold">Homepage banners (rotating hero)</h2>
        {c.banners.map((b, i) => <div key={i} className="grid sm:grid-cols-2 gap-3 border-t border-champagne pt-4 first:border-0 first:pt-0"><F n={`b${i}t`} l={`Banner ${i + 1} headline`} v={b.title} /><F n={`b${i}s`} l="Sub-headline" v={b.subtitle} /><F n={`b${i}c`} l="Button text" v={b.cta} /><F n={`b${i}h`} l="Button link (e.g. /shop?cat=jeans)" v={b.href} /></div>)}</section>
      <section className="card p-5 space-y-3"><h2 className="font-semibold">Promotion band</h2>
        <label className="flex gap-2 text-sm items-center"><input type="checkbox" name="pactive" defaultChecked={c.promo.active} className="accent-[#D99A24]" />Show on homepage</label>
        <div className="grid sm:grid-cols-2 gap-3"><F n="ptitle" l="Headline" v={c.promo.title} /><F n="pbody" l="Text" v={c.promo.body} /><F n="pcta" l="Button text" v={c.promo.cta} /><F n="phref" l="Button link" v={c.promo.href} /></div></section>
      <section className="card p-5 space-y-3"><h2 className="font-semibold">Contact details</h2><div className="grid sm:grid-cols-2 gap-3"><F n="email" l="Email" v={c.contact.email} /><F n="phone" l="Phone" v={c.contact.phone} /><F n="address" l="Address" v={c.contact.address} /><F n="hours" l="Opening hours" v={c.contact.hours} /></div><p className="text-xs text-ink/50">The WhatsApp number is set in Payment settings.</p></section>
      <section className="card p-5 space-y-3"><h2 className="font-semibold">Social links (full URLs)</h2><div className="grid sm:grid-cols-2 gap-3"><F n="instagram" l="Instagram" v={c.socials.instagram} /><F n="facebook" l="Facebook" v={c.socials.facebook} /><F n="tiktok" l="TikTok" v={c.socials.tiktok} /><F n="x" l="X / Twitter" v={c.socials.x} /></div></section>
      <button className="btn btn-dark">Save content</button>
    </form>
  );
}
