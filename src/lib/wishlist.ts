"use client";
import { useSyncExternalStore } from "react";
const KEY = "lanik_wishlist_v1";
let cache: number[] | null = null; const subs = new Set<() => void>();
const read = (): number[] => { if (cache) return cache; try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; } return cache!; };
const write = (v: number[]) => { cache = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } subs.forEach((s) => s()); };
export const wishlist = { toggle(id: number) { const c = read(); write(c.includes(id) ? c.filter((x) => x !== id) : [...c, id]); } };
const EMPTY: number[] = [];
export const useWishlist = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, read, () => EMPTY);
