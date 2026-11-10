"use client";
import { useSyncExternalStore } from "react";

export type CartItem = { productId: number; slug: string; name: string; priceKobo: number; size: string | null; color: string | null; qty: number; image?: string };
const KEY = "lanik_cart_v1";
let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
}
function write(items: CartItem[]) {
  cache = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
const same = (a: CartItem, b: CartItem) => a.productId === b.productId && a.size === b.size && a.color === b.color;

export const cart = {
  add(i: CartItem) { const c = [...read()]; const f = c.find((x) => same(x, i)); if (f) f.qty += i.qty; else c.push(i); write(c); },
  setQty(i: CartItem, qty: number) { write(read().map((x) => (same(x, i) ? { ...x, qty: Math.max(1, qty) } : x))); },
  remove(i: CartItem) { write(read().filter((x) => !same(x, i))); },
  clear() { write([]); },
};
const EMPTY: CartItem[] = [];
export function useCart() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => read(),
    () => EMPTY,
  );
}
