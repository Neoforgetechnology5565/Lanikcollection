"use client";
import { useState } from "react";
import { ImageCropper } from "./ImageCropper";

/** Photo manager: add (with crop), reorder, make main, remove. Writes the list to a hidden `images` field (one URL per line). */
export function ProductImages({ initial }: { initial: string[] }) {
  const [list, setList] = useState<string[]>(initial);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [link, setLink] = useState("");

  const move = (i: number, d: -1 | 1) => setList((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const makeMain = (i: number) => setList((l) => [l[i], ...l.filter((_, k) => k !== i)]);
  const remove = (i: number) => setList((l) => l.filter((_, k) => k !== i));

  async function upload(blob: Blob) {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.set("file", blob, "photo.jpg");
      const r = await fetch("/api/admin/upload", { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error ?? "Upload failed"); else setList((l) => [...l, d.url]);
    } catch { setErr("Network error while uploading"); }
    setBusy(false);
  }
  const addLink = () => { const v = link.trim(); if (/^https:\/\//i.test(v) || v.startsWith("/")) { setList((l) => [...l, v]); setLink(""); setErr(""); } else setErr("Links must start with https://"); };

  return (
    <div className="sm:col-span-3 space-y-3">
      <input type="hidden" name="images" value={list.join("\n")} />
      <span className="label">Photos (first one is the main photo)</span>
      {list.length === 0 && <p className="text-sm text-ink/60">No photos yet. Shoppers see a gold illustration until you add one.</p>}
      <ul className="flex flex-wrap gap-3">
        {list.map((u, i) => (
          <li key={u + i} className="w-28 border border-champagne bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Photo ${i + 1}`} className="w-full aspect-[4/5] object-cover bg-ink" />
            <div className="flex justify-between items-center px-1 py-1 text-xs">
              <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 disabled:opacity-30">←</button>
              <span className="font-semibold">{i === 0 ? "MAIN" : i + 1}</span>
              <button type="button" aria-label="Move later" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="px-1.5 disabled:opacity-30">→</button>
            </div>
            <div className="flex justify-between px-1.5 pb-1.5 text-[11px]">
              {i > 0 ? <button type="button" className="underline" onClick={() => makeMain(i)}>Make main</button> : <span />}
              <button type="button" className="text-red-700 underline" onClick={() => remove(i)}>Remove</button>
            </div>
          </li>))}
      </ul>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="btn btn-line !py-1.5 cursor-pointer">{busy ? "Uploading…" : "+ Add photos"}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => { setPending(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
        <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} placeholder="…or paste an https:// image link" className="input !w-64 !py-1.5" aria-label="Image link" />
        <button type="button" className="btn btn-line !py-1.5" onClick={addLink}>Add link</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {pending.length > 0 && <ImageCropper key={pending[0].name + pending.length} file={pending[0]} onCancel={() => setPending((p) => p.slice(1))} onDone={async (b) => { setPending((p) => p.slice(1)); await upload(b); }} />}
    </div>
  );
}
