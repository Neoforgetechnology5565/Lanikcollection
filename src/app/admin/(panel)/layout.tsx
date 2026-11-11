import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, count } from "drizzle-orm";
import { requireAdmin, destroyAdminSession } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { db, schema } from "@/db";

async function logout() { "use server"; await destroyAdminSession(); redirect("/admin/login"); }
export const metadata = { title: "Admin", robots: { index: false } };

const GROUPS: [string, [string, string][]][] = [
  ["Overview", [["/admin", "Dashboard"]]],
  ["Sales", [["/admin/orders", "Orders"], ["/admin/payments", "Payments"], ["/admin/refunds", "Refunds"], ["/admin/reports", "Reports"], ["/admin/receipts", "Receipts"], ["/admin/customers", "Customers"], ["/admin/reviews", "Reviews"], ["/admin/newsletter", "Newsletter"]]],
  ["Catalogue", [["/admin/products", "Products"], ["/admin/inventory", "Inventory"], ["/admin/categories", "Categories"], ["/admin/discounts", "Discounts"]]],
  ["Store", [["/admin/shipping", "Shipping"], ["/admin/content", "Website content"], ["/admin/payments/settings", "Payment settings"], ["/admin/emails", "Emails"], ["/admin/account", "My account"], ["/admin/email-templates", "Email templates"]]],
];
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const [pr] = await db.select({ n: count() }).from(schema.paymentProofs).where(eq(schema.paymentProofs.status, "PENDING"));
  const [rv] = await db.select({ n: count() }).from(schema.reviews).where(eq(schema.reviews.status, "PENDING"));
  const badge: Record<string, number> = { "/admin/receipts": pr.n, "/admin/reviews": rv.n };
  return (
    <div className="min-h-screen lg:flex bg-ivory">
      <aside className="lg:w-64 lg:min-h-screen bg-ink text-champagne lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto shrink-0">
        <div className="p-5 flex items-center justify-between lg:block"><Link href="/admin"><Logo dark size="sm" /></Link><p className="hidden lg:block eyebrow !text-gold-light mt-3">Administration</p></div>
        <nav className="px-3 pb-4 flex lg:block gap-x-1 overflow-x-auto lg:overflow-visible" aria-label="Admin">
          {GROUPS.map(([g, items]) => (
            <div key={g} className="flex lg:block items-center lg:mb-4">
              <p className="hidden lg:block px-3 pb-1 text-[10px] tracking-[.3em] uppercase text-champagne/40">{g}</p>
              {items.map(([h, l]) => (
                <Link key={h} href={h} className="flex items-center justify-between whitespace-nowrap px-3 py-2 text-sm rounded hover:bg-white/10 hover:text-gold-light">
                  {l}{badge[h] > 0 && <span className="ml-2 bg-gold text-ink text-[10px] font-bold rounded-full px-1.5 py-0.5">{badge[h]}</span>}
                </Link>))}
            </div>))}
        </nav>
        <div className="hidden lg:block p-4 border-t border-white/10 text-xs space-y-2"><p className="text-champagne/50 break-all">{a.email}</p>
          <Link href="/" className="block hover:text-gold-light" target="_blank">View storefront ↗</Link>
          <form action={logout}><button className="underline hover:text-gold-light">Sign out</button></form></div>
      </aside>
      <div className="flex-1 min-w-0 px-4 sm:px-8 py-8 max-w-[1400px]">
        {children}
        <form action={logout} className="lg:hidden mt-10 text-xs"><button className="underline">Sign out ({a.email})</button></form>
      </div>
    </div>
  );
}
