import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
async function add(fd: FormData) {
  "use server"; await requireAdmin();
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
  const percent = Math.round(Number(fd.get("percent")));
  if (!code || !(percent >= 1 && percent <= 90)) return;
  await db.insert(schema.discountCodes).values({ code, percent }).onConflictDoUpdate({ target: schema.discountCodes.code, set: { percent, active: true } });
  revalidatePath("/admin/discounts");
}
async function toggle(fd: FormData) { "use server"; await requireAdmin(); const c = String(fd.get("code")); await db.update(schema.discountCodes).set({ active: fd.get("active") === "1" }).where(eq(schema.discountCodes.code, c)); revalidatePath("/admin/discounts"); }
async function remove(fd: FormData) { "use server"; await requireAdmin(); await db.delete(schema.discountCodes).where(eq(schema.discountCodes.code, String(fd.get("code")))); revalidatePath("/admin/discounts"); }
export default async function Discounts() {
  const rows = await db.select().from(schema.discountCodes);
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-3xl font-bold">Discount codes</h1>
      <form action={add} className="card p-4 flex gap-2 flex-wrap"><input name="code" required placeholder="CODE (e.g. EID15)" className="input uppercase flex-1 min-w-40" /><input name="percent" type="number" min={1} max={90} required placeholder="% off" className="input !w-28" /><button className="btn btn-dark">Create</button></form>
      <ul className="card divide-y divide-champagne">{rows.length === 0 && <li className="p-4 text-sm text-ink/60">No codes yet.</li>}{rows.map((d) => (
        <li key={d.code} className="p-3 flex items-center gap-3"><b className="font-mono">{d.code}</b><span>{d.percent}% off</span><span className={`text-xs px-2 py-0.5 ${d.active ? "bg-green-100 text-green-900" : "bg-gray-200"}`}>{d.active ? "active" : "off"}</span>
          <form action={toggle} className="ml-auto"><input type="hidden" name="code" value={d.code} /><input type="hidden" name="active" value={d.active ? "0" : "1"} /><button className="btn btn-line !py-1 !px-3">{d.active ? "Disable" : "Enable"}</button></form>
          <form action={remove}><input type="hidden" name="code" value={d.code} /><button className="text-xs text-red-700 underline">Delete</button></form></li>))}</ul>
    </div>
  );
}
