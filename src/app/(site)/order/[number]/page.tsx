import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { availableMethods } from "@/lib/payments";
import { PayPanel } from "./PayPanel";
import { MethodChooser } from "./MethodChooser";
import { ReceiptForm } from "./ReceiptForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ k?: string; err?: string }> }) {
  const { number } = await params; const { k = "", err } = await searchParams;
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.accessToken, k)));
  if (!o) notFound();
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id)).orderBy(desc(schema.payments.id));
  const proofs = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.orderId, o.id)).orderBy(desc(schema.paymentProofs.id));
  const s = await getSettings();
  const active = pays.find((p) => p.status === "PENDING");
  const waiting = o.status === "AWAITING_PAYMENT";
  const methods = waiting && !active ? await availableMethods() : [];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <p className="text-xs uppercase tracking-widest text-bronze">Order</p>
      <h1 className="font-serif text-3xl font-bold">{o.number}</h1>
      {err && <p role="alert" className="mt-4 bg-red-50 border border-red-200 text-red-800 p-3 text-sm">{err}</p>}

      {o.status === "PAID" && <Banner tone="ok" title="Payment confirmed" body="Thank you! We've received your payment and are preparing your order." />}
      {o.status === "PROCESSING" && <Banner tone="ok" title="Processing" body="Your order is being prepared." />}
      {o.status === "SHIPPED" && <Banner tone="ok" title="Shipped" body="Your order is on its way." />}
      {o.status === "DELIVERED" && <Banner tone="ok" title="Delivered" body="Your order has been delivered." />}
      {o.status === "REVIEW" && <Banner tone="warn" title="Payment under review" body="We received a payment that needs a quick manual check. Our team will contact you shortly; no need to pay again." />}
      {o.status === "EXPIRED" && <Banner tone="bad" title="Payment window closed" body="This order expired before we received payment. If you've already transferred money, don't worry: it will be matched automatically and our team will confirm." />}
      {o.status === "CANCELLED" && <Banner tone="bad" title="Order cancelled" body="This order was cancelled." />}

      {waiting && active?.method === "bank_transfer" && active.vaAccountNumber && (
        <PayPanel number={o.number} k={k} amountKobo={active.amountKobo}
          bank={active.vaBank!} accountNumber={active.vaAccountNumber} accountName={active.vaAccountName ?? s.businessName}
          note={active.vaNote} expiresAt={(active.vaExpiresAt ?? o.expiresAt)!.toISOString()} />
      )}
      {waiting && active && active.method !== "bank_transfer" && active.method !== "manual_transfer" && (
        <div className="mt-6 card p-5 space-y-3">
          <p>Your payment is ready. Complete it with Flutterwave, our secure payment partner.</p>
          {active.checkoutLink && <a className="btn btn-gold" href={active.checkoutLink}>Continue to payment</a>}
          <PayPanel number={o.number} k={k} amountKobo={active.amountKobo} statusOnly expiresAt={o.expiresAt?.toISOString() ?? null} />
        </div>
      )}
      {waiting && active?.method === "manual_transfer" && (
        <div className="mt-6 card p-5 space-y-3">
          <h2 className="font-serif text-xl font-bold">Pay by bank transfer</h2>
          <dl className="text-sm grid grid-cols-[8rem_1fr] gap-y-1">
            <dt className="text-ink/60">Bank</dt><dd className="font-semibold">{s.bank.bankName}</dd>
            <dt className="text-ink/60">Account name</dt><dd className="font-semibold">{s.bank.accountName}</dd>
            <dt className="text-ink/60">Account number</dt><dd className="font-semibold tracking-wider">{s.bank.accountNumber}</dd>
            <dt className="text-ink/60">Amount</dt><dd className="font-semibold">{naira(o.totalKobo)}</dd>
          </dl>
          <p className="text-sm text-ink/70">{s.bank.instructions}</p>
          <p className="text-sm bg-champagne/50 p-3">Uploading a receipt does <b>not</b> confirm your order. Our team checks every transfer against our bank statement first.</p>
          <ReceiptForm number={o.number} k={k} />
          {proofs.length > 0 && <ul className="text-sm">{proofs.map((p) => <li key={p.id}>Receipt {p.reference}: <b>{p.status === "PENDING" ? "awaiting review" : p.status.toLowerCase()}</b>{p.reviewNote ? ` (${p.reviewNote})` : ""}</li>)}</ul>}
        </div>
      )}
      {waiting && !active && <MethodChooser number={o.number} k={k} methods={methods} />}

      <section className="mt-8 card p-5">
        <h2 className="font-serif text-xl font-bold">Order summary</h2>
        <ul className="mt-3 text-sm divide-y divide-champagne">{items.map((i) => <li key={i.id} className="py-2 flex justify-between"><span>{i.name} ×{i.qty} <span className="text-ink/50">{[i.size, i.color].filter(Boolean).join(" · ")}</span></span><span>{naira(i.unitKobo * i.qty)}</span></li>)}</ul>
        <div className="mt-3 text-sm space-y-1 border-t border-champagne pt-3">
          <p className="flex justify-between"><span>Subtotal</span><span>{naira(o.subtotalKobo)}</span></p>
          {o.discountKobo > 0 && <p className="flex justify-between"><span>Discount ({o.discountCode})</span><span>−{naira(o.discountKobo)}</span></p>}
          <p className="flex justify-between"><span>Shipping</span><span>{naira(o.shippingKobo)}</span></p>
          <p className="flex justify-between font-bold text-base"><span>Total</span><span>{naira(o.totalKobo)}</span></p>
        </div>
        <p className="mt-4 text-sm text-ink/60">Deliver to: {o.customerName}, {o.address}, {o.city}, {o.state}. Phone {o.phone}</p>
      </section>
    </div>
  );
}

function Banner({ tone, title, body }: { tone: "ok" | "warn" | "bad"; title: string; body: string }) {
  const c = tone === "ok" ? "bg-green-50 border-green-300 text-green-900" : tone === "warn" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-red-50 border-red-300 text-red-900";
  return <div role="status" className={`mt-6 border p-4 ${c}`}><p className="font-bold">{title}</p><p className="text-sm mt-1">{body}</p></div>;
}
