"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Method } from "@/lib/methods";
import { MethodPicker } from "@/components/MethodPicker";

export function MethodChooser({ number, k, methods }: { number: string; k: string; methods: Method[] }) {
  const router = useRouter();
  const [m, setM] = useState<Method | "">(methods[0] ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go() {
    if (!m) return; setBusy(true); setErr("");
    const r = await fetch(`/api/orders/${number}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, method: m }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { if (d.next) window.location.href = d.next; else router.replace(`/order/${number}?k=${k}`); router.refresh(); return; }
    setErr(d.error ?? "Could not start payment"); setBusy(false);
  }
  return (
    <section className="mt-6 card p-5 space-y-3">
      <h2 className="font-serif text-xl font-bold">Choose how to pay</h2>
      <MethodPicker methods={methods} value={m} onChange={setM} />
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      <button className="btn btn-gold" disabled={!m || busy} onClick={go}>{busy ? "Please wait…" : "Pay now"}</button>
    </section>
  );
}
