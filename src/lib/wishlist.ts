"use client";
import { useSyncExternalStore } from "react";
const KEY = "lanik_wishlist_v1";
let cache: number[] | null = null; const subs = new Set<() => void>();
let signedIn = false; // set by <WishlistSync/>; when true every change is mirrored to the account
const read = (): number[] => { if (cache) return cache; try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; } return cache!; };
const write = (v: number[]) => { cache = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } subs.forEach((s) => s()); };

export const wishlist = {
  toggle(id: number) {
    const c = read(); const on = !c.includes(id);
    write(on ? [...c, id] : c.filter((x) => x !== id));
    if (signedIn) fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, on }) }).catch(() => {});
  },
  /** On sign-in: merge this device's list with the account's list (union), then keep both in step. */
  async sync() {
    signedIn = true;
    try {
      const r = await fetch("/api/wishlist", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: read() }) });
      if (r.ok) write((await r.json()).ids);
    } catch { /* offline: local list still works */ }
  },
  detach() { signedIn = false; },
};
const EMPTY: number[] = [];
export const useWishlist = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, read, () => EMPTY);
