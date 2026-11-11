"use client";
import { useState } from "react";

/** Single-image field for logos/favicon: resizes in the browser (keeping transparency for PNG), uploads, stores the URL in a hidden input. */
export function ImageUploadField({ name, label, initial, hint, maxSide = 800, dark = false }: { name: string; label: string; initial: string; hint?: string; maxSide?: number; dark?: boolean }) {
  const [url, setUrl] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function pick(file: File) {
    setBusy(true); setErr("");
    try {
      const bmp = await createImageBitmap(file); const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const png = file.type === "image/png" || file.type === "image/webp"; // keep transparent backgrounds
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), png ? "image/png" : "image/jpeg", 0.9));
      const fd = new FormData(); fd.set("file", blob, "brand.png");
      const r = await fetch("/api/admin/upload", { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
      if (r.ok) setUrl(d.url); else setErr(d.error ?? "Upload failed");
    } catch { setErr("Couldn't read that image. Use a JPG, PNG or WEBP file."); }
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={url} />
      <span className="label">{label}</span>
      {url ? <div className={`inline-flex p-3 border border-champagne ${dark ? "bg-ink" : "bg-white"}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="max-h-16 max-w-48 object-contain" /></div> : <p className="text-sm text-ink/60">Not set: the text logo is used.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-line !py-1.5 cursor-pointer">{busy ? "Uploading…" : url ? "Replace" : "Upload"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} /></label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an https:// link" className="input !w-64 !py-1.5" aria-label={`${label} link`} />
        {url && <button type="button" className="text-sm underline text-red-700" onClick={() => setUrl("")}>Remove</button>}
      </div>
      {hint && <p className="text-xs text-ink/50">{hint}</p>}{err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
