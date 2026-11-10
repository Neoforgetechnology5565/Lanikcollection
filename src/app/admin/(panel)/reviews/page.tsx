import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
async function setStatus(fd: FormData) {
  "use server"; await requireAdmin();
  const status = ["APPROVED", "REJECTED"].find((s) => s === fd.get("status")); if (!status) return;
  await db.update(schema.reviews).set({ status }).where(eq(schema.reviews.id, Number(fd.get("id")))); revalidatePath("/admin/reviews"); revalidatePath("/");
}
export default async function Reviews() {
  const rows = await db.select({ r: schema.reviews, p: schema.products.name }).from(schema.reviews).innerJoin(schema.products, eq(schema.products.id, schema.reviews.productId)).orderBy(desc(schema.reviews.id)).limit(100);
  return (
    <div className="space-y-4 max-w-3xl"><h1 className="font-serif text-3xl font-bold">Reviews</h1>
      <p className="text-sm text-ink/70">Only verified buyers can submit reviews. Approve to publish.</p>
      {rows.length === 0 && <p className="text-ink/60">No reviews yet.</p>}
      {rows.map(({ r, p }) => <div key={r.id} className="card p-4 flex justify-between gap-4 flex-wrap"><div><p className="text-gold tracking-widest">{"★".repeat(r.rating)}</p><p className="mt-1">{r.body}</p><p className="text-xs text-ink/50 mt-1">{r.name} on {p} · {r.status}</p></div>
        <form action={setStatus} className="flex gap-2 items-start"><input type="hidden" name="id" value={r.id} />
          <button name="status" value="APPROVED" className="btn btn-gold !py-1.5" disabled={r.status === "APPROVED"}>Approve</button><button name="status" value="REJECTED" className="btn btn-line !py-1.5" disabled={r.status === "REJECTED"}>Reject</button></form></div>)}
    </div>
  );
}
