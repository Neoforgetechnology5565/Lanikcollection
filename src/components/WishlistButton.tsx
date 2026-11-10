"use client";
import { useWishlist, wishlist } from "@/lib/wishlist";
export function WishlistButton({ id, label = false }: { id: number; label?: boolean }) {
  const on = useWishlist().includes(id);
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); wishlist.toggle(id); }}
      className={`inline-flex items-center gap-2 ${label ? "btn btn-line" : "h-9 w-9 justify-center bg-ivory/90 hover:bg-white rounded-full shadow"}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={on ? "#D99A24" : "none"} stroke={on ? "#A66A25" : "currentColor"} strokeWidth="1.8"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5.5 6.2 5.5c1.9 0 3.2 1 3.8 2.1.6-1.1 1.9-2.1 3.8-2.1 3.2 0 5 3.1 3.7 6.3C19.5 16.4 12 21 12 21z" /></svg>
      {label && <span>{on ? "Saved" : "Save"}</span>}
    </button>
  );
}
