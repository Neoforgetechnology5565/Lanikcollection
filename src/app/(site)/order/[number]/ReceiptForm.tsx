"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReceiptForm({ number, k }: { number: string; k: string }) {
  const router = useRouter(); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg("");
    const f = new FormData(e.currentTarget); f.set("k", k);
    const r = await fetch(`/api/orders/${number}/receipt`, { method: "POST", body: f });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg("Receipt submitted. We'll verify it and update your order."); router.refresh(); } else setMsg(d.error ?? "Upload failed");
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-champagne pt-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label" htmlFor="reference">Transaction reference</label><input id="reference" name="reference" required minLength={3} className="input" /></div>
        <div><label className="label" htmlFor="amount">Amount paid (₦)</label><input id="amount" name="amount" required type="number" min="1" step="0.01" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="receipt">Receipt (JPG, PNG, WEBP or PDF, max 5MB)</label><input id="receipt" name="receipt" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="input" /></div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <button className="btn btn-dark" disabled={busy}>{busy ? "Uploading…" : "Submit receipt"}</button>
    </form>
  );
}
