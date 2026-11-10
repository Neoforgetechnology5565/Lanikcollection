import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";

type Dbx = typeof db | Tx;

export const combos = (sizes: string[], colors: string[]) => {
  const S = sizes.length ? sizes : [""], C = colors.length ? colors : [""];
  return S.flatMap((size) => C.map((color) => ({ size, color })));
};

/** products.stock is a cached total of its variants; call after any variant stock change. */
export async function recomputeStock(dbx: Dbx, productId: number) {
  await dbx.update(schema.products).set({
    stock: sql`(select coalesce(sum(${schema.productVariants.stock}),0)::int from ${schema.productVariants} where ${schema.productVariants.productId} = ${productId})`,
  }).where(eq(schema.products.id, productId));
}

/**
 * Make the variant rows match the product's size/colour lists. Existing combos keep their stock,
 * new combos start at `initialStock`, combos no longer offered are removed.
 */
export async function syncVariants(dbx: Dbx, productId: number, sizes: string[], colors: string[], initialStock = 0) {
  const want = combos(sizes, colors);
  const have = await dbx.select().from(schema.productVariants).where(eq(schema.productVariants.productId, productId));
  const key = (v: { size: string; color: string }) => `${v.size}\u0000${v.color}`;
  const haveKeys = new Set(have.map(key)); const wantKeys = new Set(want.map(key));
  const add = want.filter((w) => !haveKeys.has(key(w)));
  if (add.length) await dbx.insert(schema.productVariants).values(add.map((w) => ({ productId, ...w, stock: initialStock }))).onConflictDoNothing();
  const drop = have.filter((h) => !wantKeys.has(key(h))).map((h) => h.id);
  if (drop.length) await dbx.delete(schema.productVariants).where(inArray(schema.productVariants.id, drop));
  await recomputeStock(dbx, productId);
}

/** Set every variant of a product to the same stock (tests, bulk edits). */
export async function setAllStock(dbx: Dbx, productId: number, stock: number) {
  await dbx.update(schema.productVariants).set({ stock }).where(eq(schema.productVariants.productId, productId));
  await recomputeStock(dbx, productId);
}

/** Atomically take `qty` from one variant. Returns false (and changes nothing) if not enough. */
export async function takeVariantStock(dbx: Dbx, productId: number, size: string | null, color: string | null, qty: number) {
  const r = await dbx.update(schema.productVariants).set({ stock: sql`${schema.productVariants.stock} - ${qty}` })
    .where(and(eq(schema.productVariants.productId, productId), eq(schema.productVariants.size, size ?? ""), eq(schema.productVariants.color, color ?? ""), sql`${schema.productVariants.stock} >= ${qty}`))
    .returning({ id: schema.productVariants.id });
  return r.length > 0;
}
export async function returnVariantStock(dbx: Dbx, productId: number, size: string | null, color: string | null, qty: number) {
  await dbx.update(schema.productVariants).set({ stock: sql`${schema.productVariants.stock} + ${qty}` })
    .where(and(eq(schema.productVariants.productId, productId), eq(schema.productVariants.size, size ?? ""), eq(schema.productVariants.color, color ?? "")));
}
