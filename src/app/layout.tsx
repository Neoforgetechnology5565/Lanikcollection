import type { Metadata } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "LANIK COLLECTIONS | Quality Fashion · Fragrance · Lifestyle", template: "%s | LANIK COLLECTIONS" },
  description: "Perfumes, boxers, singlets, polo shirts, jeans and more. Wholesale & retail. Quality deals at affordable prices.",
  openGraph: { siteName: "LANIK COLLECTIONS", type: "website" },
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen flex flex-col antialiased">{children}</body></html>;
}
