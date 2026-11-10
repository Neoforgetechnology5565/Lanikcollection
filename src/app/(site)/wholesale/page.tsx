import { getSettings } from "@/lib/settings";
export const metadata = { title: "Wholesale" };
export default async function Wholesale() {
  const wa = (await getSettings()).whatsapp.replace(/\D/g, "");
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="font-serif text-4xl font-bold">Wholesale enquiries</h1>
      <p className="mt-4 text-ink/80">Buy in bulk and save. Products with a wholesale price show it on their page, and it applies automatically at checkout once you reach the minimum quantity. For custom quotes, mixed orders or delivery to multiple locations, message us.</p>
      {wa ? <a className="btn btn-gold mt-6" href={`https://wa.me/${wa}?text=${encodeURIComponent("Hello LANIK COLLECTIONS, I'd like a wholesale quote.")}`}>Chat on WhatsApp</a> : <p className="mt-6 text-bronze">WhatsApp contact coming soon.</p>}
    </div>
  );
}
