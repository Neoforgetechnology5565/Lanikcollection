import Link from "next/link";
import { Logo } from "@/components/Logo";
export const metadata = { title: "About us" };
export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14 text-center">
      <div className="flex justify-center"><Logo size="lg" /></div>
      <p className="eyebrow mt-10">Our story</p><h1 className="section-title mt-2">Quality you can feel. Prices you&apos;ll love.</h1>
      <div className="rule mt-6 mx-auto max-w-xs" />
      <p className="mt-8 text-lg text-ink/80 leading-relaxed">LANIK COLLECTIONS brings together fragrance, everyday essentials and wardrobe staples (perfumes, boxers, singlets, polos, jeans and more) for retail and wholesale customers who want quality without the markup.</p>
      <Link href="/shop" className="btn btn-gold mt-8">Explore the collection</Link>
    </div>
  );
}
