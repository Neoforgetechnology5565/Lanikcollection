"use client";
import Link from "next/link";
import { useCart } from "@/lib/cart";
export function CartLink() {
  const items = useCart();
  const n = items.reduce((a, i) => a + i.qty, 0);
  return (
    <Link href="/cart" className="relative text-sm font-semibold tracking-wider uppercase hover:text-bronze">
      Cart{n > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-gold text-ink text-[11px]">{n}</span>}
    </Link>
  );
}
