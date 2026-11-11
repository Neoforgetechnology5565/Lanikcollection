"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Pick a photo, drag/zoom it inside a fixed frame, and get back a small cropped JPEG blob.
 * Everything happens in the browser, so uploads stay small and the server never receives a huge original.
 */
export type Aspect = { w: number; h: number; out: [number, number] };
export const PRODUCT_ASPECT: Aspect = { w: 4, h: 5, out: [1200, 1500] };

export function ImageCropper({ file, aspect = PRODUCT_ASPECT, onDone, onCancel }: { file: File; aspect?: Aspect; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const FW = 320, FH = Math.round((FW * aspect.h) / aspect.w);
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const img = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const base = nat ? Math.max(FW / nat.w, FH / nat.h) : 1;           // "cover" scale
  const scale = base * zoom;
  const clamp = (x: number, y: number, s = scale) => nat ? ({ x: Math.min(0, Math.max(FW - nat.w * s, x)), y: Math.min(0, Math.max(FH - nat.h * s, y)) }) : { x, y };

  useEffect(() => { if (nat) setOff(clamp((FW - nat.w * base) / 2, (FH - nat.h * base) / 2, base)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [nat]);
  const changeZoom = (z: number) => { // zoom around the frame centre
    if (!nat) return; const ns = base * z; const cx = (FW / 2 - off.x) / scale, cy = (FH / 2 - off.y) / scale;
    setZoom(z); setOff(clamp(FW / 2 - cx * ns, FH / 2 - cy * ns, ns));
  };

  function done(crop: boolean) {
    if (!nat || !img.current) return;
    const [ow, oh] = aspect.out; const c = document.createElement("canvas");
    let sx = 0, sy = 0, sw = nat.w, sh = nat.h;
    if (crop) { sx = -off.x / scale; sy = -off.y / scale; sw = FW / scale; sh = FH / scale; c.width = ow; c.height = oh; }
    else { const k = Math.min(1, 1600 / Math.max(nat.w, nat.h)); c.width = Math.round(nat.w * k); c.height = Math.round(nat.h * k); } // keep the whole picture, just shrink it
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img.current, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onDone(b), "image/jpeg", 0.86);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-ink/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="bg-ivory p-5 max-w-sm w-full space-y-4">
        <p className="font-semibold">Position your photo</p>
        <div className="relative mx-auto overflow-hidden bg-ink touch-none select-none cursor-grab active:cursor-grabbing" style={{ width: FW, height: FH }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py)); }}
          onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={src} alt="" draggable={false} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ position: "absolute", left: off.x, top: off.y, width: nat ? nat.w * scale : "auto", maxWidth: "none", pointerEvents: "none" }} />
        </div>
        <label className="block text-xs">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="w-full accent-[#D99A24]" aria-label="Zoom" /></label>
        <p className="text-xs text-ink/60">Drag to move. Photos are shown at {aspect.w}:{aspect.h} in the shop.</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-gold" onClick={() => done(true)} disabled={!nat}>Use this crop</button>
          <button type="button" className="btn btn-line" onClick={() => done(false)} disabled={!nat}>Keep whole photo</button>
          <button type="button" className="text-sm underline ml-auto" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
