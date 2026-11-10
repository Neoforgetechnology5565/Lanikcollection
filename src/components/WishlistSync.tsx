"use client";
import { useEffect } from "react";
import { wishlist } from "@/lib/wishlist";
export function WishlistSync({ signedIn }: { signedIn: boolean }) {
  useEffect(() => { if (signedIn) wishlist.sync(); else wishlist.detach(); }, [signedIn]);
  return null;
}
