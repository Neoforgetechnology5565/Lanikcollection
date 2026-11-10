import { getContent } from "@/lib/content";
import { getSettings } from "@/lib/settings";
export const metadata = { title: "Contact us" };
export default async function Contact() {
  const [c, s] = await Promise.all([getContent(), getSettings()]); const wa = s.whatsapp.replace(/\D/g, "");
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14">
      <p className="eyebrow">Get in touch</p><h1 className="section-title mt-2">Contact us</h1><div className="rule mt-5 max-w-xs" />
      <div className="mt-8 grid sm:grid-cols-2 gap-5">
        {wa && <a href={`https://wa.me/${wa}`} className="card p-6 hover:border-gold block"><p className="eyebrow">WhatsApp</p><p className="font-serif text-2xl mt-1">+{wa}</p><p className="text-sm text-ink/60 mt-1">Fastest way to reach us</p></a>}
        {c.contact.phone && <a href={`tel:${c.contact.phone}`} className="card p-6 hover:border-gold block"><p className="eyebrow">Phone</p><p className="font-serif text-2xl mt-1">{c.contact.phone}</p></a>}
        {c.contact.email && <a href={`mailto:${c.contact.email}`} className="card p-6 hover:border-gold block"><p className="eyebrow">Email</p><p className="font-serif text-2xl mt-1 break-all">{c.contact.email}</p></a>}
        {c.contact.address && <div className="card p-6"><p className="eyebrow">Visit</p><p className="mt-1">{c.contact.address}</p><p className="text-sm text-ink/60 mt-1">{c.contact.hours}</p></div>}
      </div>
      {!wa && !c.contact.phone && !c.contact.email && <p className="mt-8 text-ink/60">Contact details are coming soon.</p>}
    </div>
  );
}
