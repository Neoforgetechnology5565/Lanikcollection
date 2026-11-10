"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { naira } from "@/lib/money";

type Props = {
  number: string; k: string; amountKobo: number; expiresAt: string | null; statusOnly?: boolean;
  bank?: string; accountNumber?: string; accountName?: string; note?: string | null;
};

export function PayPanel(p: Props) {
  const router = useRouter();
  const end = p.expiresAt ? new Date(p.expiresAt).getTime() : null;
  const [left, setLeft] = useState<number | null>(end ? Math.max(0, end - Date.now()) : null);
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const done = useRef(false);

  async function check() {
    if (done.current) return;
    setChecking(true);
    try {
      const r = await fetch(`/api/orders/${p.number}/status?k=${p.k}`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); if (d.status !== "AWAITING_PAYMENT") { done.current = true; router.refresh(); } }
    } catch { /* retry on next tick */ }
    setChecking(false);
  }
  // Countdown tick. Time is only cosmetic: the server decides when the order expires.
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000);
    return () => clearInterval(t);
  }, [end]);
  // Poll the server, which verifies with the payment provider. The browser cannot declare a payment successful.
  useEffect(() => {
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (left === 0) check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [left === 0]);

  const mm = left != null ? String(Math.floor(left / 60000)).padStart(2, "0") : "--";
  const ss = left != null ? String(Math.floor((left % 60000) / 1000)).padStart(2, "0") : "--";
  const hh = left != null && left >= 3600_000 ? `${Math.floor(left / 3600_000)}:` : "";
  const mmShown = left != null && left >= 3600_000 ? String(Math.floor((left % 3600_000) / 60000)).padStart(2, "0") : mm;
  const copy = async (label: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(label); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ } };

  if (p.statusOnly) {
    return <p className="text-xs text-ink/60" aria-live="polite">{checking ? "Checking payment…" : "We'll update this page automatically once your payment is confirmed."}</p>;
  }
  const expired = left === 0;
  return (
    <section className="mt-6 card p-5 border-gold/60" aria-labelledby="va-h">
      <h2 id="va-h" className="font-serif text-xl font-bold">Transfer to this account</h2>
      <p className="text-sm text-ink/70 mt-1">This account was created for this order only. Send the exact amount below.</p>
      <dl className="mt-4 grid grid-cols-[8.5rem_1fr_auto] gap-y-3 items-center text-sm">
        <dt className="text-ink/60">Bank</dt><dd className="font-semibold col-span-2">{p.bank}</dd>
        <dt className="text-ink/60">Account number</dt><dd className="font-bold text-2xl tracking-widest">{p.accountNumber}</dd>
        <dd><button className="btn btn-line !py-1 !px-3" onClick={() => copy("acct", p.accountNumber!)}>{copied === "acct" ? "Copied" : "Copy"}</button></dd>
        <dt className="text-ink/60">Account name</dt><dd className="font-semibold col-span-2">{p.accountName}</dd>
        <dt className="text-ink/60">Exact amount</dt><dd className="font-bold text-2xl">{naira(p.amountKobo)}</dd>
        <dd><button className="btn btn-line !py-1 !px-3" onClick={() => copy("amt", String(p.amountKobo / 100))}>{copied === "amt" ? "Copied" : "Copy"}</button></dd>
      </dl>
      {p.note && <p className="mt-3 text-xs text-ink/60">{p.note}</p>}
      <div className="mt-5 flex items-center justify-between bg-ink text-champagne px-4 py-3" role="timer" aria-live="off">
        <span className="text-xs uppercase tracking-widest">{expired ? "Account expired" : "Account expires in"}</span>
        <span className="font-mono text-2xl text-gold-light">{expired ? "00:00" : `${hh}${mmShown}:${ss}`}</span>
      </div>
      <p className="mt-3 text-xs text-ink/60" aria-live="polite">
        {expired ? "If you already sent the money, it will still be matched to your order automatically. Don't send it again." : checking ? "Checking for your payment…" : "Waiting for your transfer. This page updates automatically; you don't need to refresh or send a screenshot."}
      </p>
      <p className="mt-2 text-xs text-ink/60">Transfer exactly the amount shown. A different amount may need manual review.</p>
    </section>
  );
}
