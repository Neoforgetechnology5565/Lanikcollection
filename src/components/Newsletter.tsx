"use client";
import { useState } from "react";
export function Newsletter({ dark = false }: { dark?: boolean }) {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = e.currentTarget; const email = new FormData(f).get("email");
    const r = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    setBusy(false); setMsg(r.ok ? "You're on the list. Thank you!" : "Please enter a valid email."); if (r.ok) f.reset();
  }
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-md" aria-label="Newsletter">
      <input name="email" type="email" required placeholder="Your email address" aria-label="Email address" className={`input flex-1 ${dark ? "!bg-white/5 !border-white/20 text-champagne placeholder:text-champagne/40" : ""}`} />
      <button className="btn btn-gold" disabled={busy}>Subscribe</button>
      {msg && <p role="status" className="text-xs sm:basis-full">{msg}</p>}
    </form>
  );
}
