import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, destroyAdminSession } from "@/lib/session";

async function logout() { "use server"; await destroyAdminSession(); redirect("/admin/login"); }

const NAV = [["/admin", "Dashboard"], ["/admin/payments", "Payments"], ["/admin/receipts", "Receipts"], ["/admin/orders", "Orders"], ["/admin/products", "Products"], ["/admin/payments/settings", "Settings"]];
export const metadata = { title: "Admin", robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-champagne pb-3">
        <b className="font-serif text-lg">Admin</b>
        {NAV.map(([h, l]) => <Link key={h} href={h} className="text-sm font-semibold uppercase tracking-wider hover:text-bronze">{l}</Link>)}
        <form action={logout} className="ml-auto flex items-center gap-3 text-xs"><span className="text-ink/50">{a.email}</span><button className="underline">Sign out</button></form>
      </div>
      <div className="pt-6">{children}</div>
    </div>
  );
}
