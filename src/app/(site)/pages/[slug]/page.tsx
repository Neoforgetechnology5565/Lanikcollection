import { notFound } from "next/navigation";
import Link from "next/link";

const PAGES: Record<string, { title: string; body: { h?: string; p: string }[] }> = {
  faq: { title: "Frequently asked questions", body: [
    { h: "How can I pay?", p: "By debit or credit card (Visa, Mastercard, Verve), bank transfer to an account generated just for your order, USSD, OPay or QR. Available methods are shown at checkout." },
    { h: "How does bank transfer work?", p: "We create a temporary account number for your order. Send the exact amount shown before the countdown ends. We detect the payment automatically; you don't need to send a screenshot. If you pay slightly late, it is still matched to your order." },
    { h: "Do you sell wholesale?", p: "Yes. Products with a wholesale price show it on their page, applied automatically at the minimum quantity. For custom quotes, contact us on WhatsApp." },
    { h: "How do I track my order?", p: "Use the Track Order page with your order number and email, or sign in to your account." },
  ] },
  "shipping-returns": { title: "Shipping & returns", body: [
    { h: "Delivery", p: "Delivery fees depend on your state and are shown at checkout before you pay. You'll get an email when your order ships." },
    { h: "Returns", p: "If an item arrives damaged or wrong, contact us within 48 hours of delivery with your order number and photos, and we'll make it right. Please keep items unused with tags attached." },
    { p: "Note to store owner: review and edit this policy to match your actual delivery times and return terms before launch." },
  ] },
  privacy: { title: "Privacy policy", body: [
    { h: "What we collect", p: "Your name, email, phone number and delivery address so we can fulfil your order, plus your order history. Card details are entered on Flutterwave's secure pages and never reach our servers." },
    { h: "How we use it", p: "To process payments, deliver orders, send order updates and, if you subscribe, occasional offers. We don't sell your data." },
    { p: "Note to store owner: have this policy reviewed against Nigerian data-protection requirements (NDPA) before launch." },
  ] },
  terms: { title: "Terms of sale", body: [
    { h: "Orders and pricing", p: "Prices are in Nigerian Naira. An order is confirmed only after payment is verified. Unpaid orders expire automatically and reserved stock is released." },
    { h: "Payments", p: "Payments are processed by Flutterwave. If you pay after an order has expired, we'll match the payment and either confirm the order or contact you for a refund." },
    { p: "Note to store owner: have these terms reviewed before launch." },
  ] },
};
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const p = PAGES[(await params).slug]; return p ? { title: p.title } : {}; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = PAGES[(await params).slug]; if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14">
      <h1 className="section-title">{p.title}</h1><div className="rule mt-5 max-w-xs" />
      <div className="mt-8 space-y-6">{p.body.map((b, i) => <div key={i}>{b.h && <h2 className="font-serif text-xl font-bold">{b.h}</h2>}<p className={`text-ink/80 leading-relaxed ${b.h ? "mt-1" : "text-sm italic bg-champagne/40 p-3"}`}>{b.p}</p></div>)}</div>
      <Link href="/contact" className="btn btn-gold mt-10">Still need help? Contact us</Link>
    </div>
  );
}
