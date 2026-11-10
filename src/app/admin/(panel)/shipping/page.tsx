import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { STATES } from "@/lib/states";

export const dynamic = "force-dynamic";
async function save(fd: FormData) {
  "use server"; await requireAdmin();
  for (const st of STATES) {
    const v = String(fd.get(`s_${st}`) ?? "").trim();
    if (v === "") await db.delete(schema.shippingZones).where(eq(schema.shippingZones.state, st));
    else { const kobo = Math.max(0, Math.round(Number(v) * 100)); if (Number.isFinite(kobo)) await db.insert(schema.shippingZones).values({ state: st, feeKobo: kobo }).onConflictDoUpdate({ target: schema.shippingZones.state, set: { feeKobo: kobo } }); }
  }
  revalidatePath("/admin/shipping");
}
export default async function Shipping() {
  const [s, zones] = await Promise.all([getSettings(), db.select().from(schema.shippingZones)]);
  const fee = new Map(zones.map((z) => [z.state, z.feeKobo]));
  return (
    <form action={save} className="space-y-5 max-w-4xl">
      <h1 className="font-serif text-3xl font-bold">Shipping fees by state</h1>
      <p className="text-sm text-ink/70">Leave a state blank to use the default flat fee (₦{(s.shippingFlatKobo / 100).toLocaleString()}, change it in Payment settings). Customers see the exact fee after choosing their state.</p>
      <div className="card p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{STATES.map((st) => (
        <label key={st} className="flex items-center gap-2 text-sm"><span className="w-28 shrink-0">{st}</span><input name={`s_${st}`} type="number" min={0} step="50" defaultValue={fee.has(st) ? fee.get(st)! / 100 : ""} placeholder="default" className="input !py-1.5" /></label>))}</div>
      <button className="btn btn-dark">Save shipping fees</button>
    </form>
  );
}
