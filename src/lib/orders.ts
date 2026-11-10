import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { getSettings } from "./settings";
import { recomputeStock, takeVariantStock, returnVariantStock } from "./catalog";

export type CartLine = { productId: number; size?: string | null; color?: string | null; qty: number };
export type CheckoutInput = {
  customerName: string; email: string; phone: string; address: string; city: string; state: string;
  notes?: string | null; discountCode?: string | null; items: CartLine[];
};

export class OrderError extends Error {}

const newNumber = () => {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `LNK-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
};

export function unitPrice(p: { priceKobo: number; saleKobo: number | null; wholesaleKobo: number | null; wholesaleMin: number | null }, qty: number) {
  let u = p.saleKobo != null && p.saleKobo > 0 && p.saleKobo < p.priceKobo ? p.saleKobo : p.priceKobo;
  if (p.wholesaleKobo && p.wholesaleMin && qty >= p.wholesaleMin) u = Math.min(u, p.wholesaleKobo);
  return u;
}

export type Quote = {
  lines: { productId: number; name: string; size: string | null; color: string | null; qty: number; unitKobo: number }[];
  subtotalKobo: number; discountKobo: number; discountCode: string | null; shippingKobo: number; totalKobo: number;
};

/** Prices are always recomputed from the database; the client's totals are never trusted. Pure read: reserves nothing. */
export async function priceCart(q: Pick<CheckoutInput, "items" | "discountCode"> & { state?: string | null }, dbx: typeof db | Tx = db): Promise<Quote> {
  if (!q.items.length) throw new OrderError("Your cart is empty");
  const settings = await getSettings();
  const lines = new Map<string, CartLine>();
  for (const l of q.items) {
    const k = `${l.productId}|${l.size ?? ""}|${l.color ?? ""}`;
    const prev = lines.get(k);
    lines.set(k, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  const merged = [...lines.values()];
  const ids = [...new Set(merged.map((l) => l.productId))];
  const prods = await dbx.select().from(schema.products).where(inArray(schema.products.id, ids));
  const byId = new Map(prods.map((p) => [p.id, p]));
  const out: Quote["lines"] = []; let subtotal = 0;
  for (const l of merged) {
    const p = byId.get(l.productId);
    if (!p || !p.active) throw new OrderError("A product in your cart is no longer available");
    if (p.sizes.length && (!l.size || !p.sizes.includes(l.size))) throw new OrderError(`Choose a size for ${p.name}`);
    if (p.colors.length && (!l.color || !p.colors.includes(l.color))) throw new OrderError(`Choose a colour for ${p.name}`);
    const total = merged.filter((m) => m.productId === p.id).reduce((a, m) => a + m.qty, 0); // wholesale tier uses total qty of the product
    const unit = unitPrice(p, total);
    subtotal += unit * l.qty;
    out.push({ productId: p.id, name: p.name, size: l.size ?? null, color: l.color ?? null, qty: l.qty, unitKobo: unit });
  }
  let discount = 0; let code: string | null = null;
  if (q.discountCode?.trim()) {
    const [d] = await dbx.select().from(schema.discountCodes)
      .where(and(eq(schema.discountCodes.code, q.discountCode.trim().toUpperCase()), eq(schema.discountCodes.active, true)));
    if (!d) throw new OrderError("That discount code is not valid");
    discount = Math.floor((subtotal * d.percent) / 100); code = d.code;
  }
  let shipping = settings.shippingFlatKobo;
  if (q.state) {
    const [z] = await dbx.select().from(schema.shippingZones).where(eq(schema.shippingZones.state, q.state));
    if (z) shipping = z.feeKobo;
  }
  return { lines: out, subtotalKobo: subtotal, discountKobo: discount, discountCode: code, shippingKobo: shipping, totalKobo: subtotal - discount + shipping };
}

export async function createOrder(input: CheckoutInput & { customerId?: number | null }) {
  return db.transaction(async (tx) => {
    const quote = await priceCart({ items: input.items, discountCode: input.discountCode, state: input.state }, tx);
    // atomic per-variant reservation: never oversell a size/colour
    const touched = new Set<number>();
    for (const l of quote.lines) {
      if (!(await takeVariantStock(tx, l.productId, l.size, l.color, l.qty))) {
        throw new OrderError(`Sorry, "${l.name}"${[l.size, l.color].filter(Boolean).length ? ` (${[l.size, l.color].filter(Boolean).join(", ")})` : ""} does not have enough stock`);
      }
      touched.add(l.productId);
    }
    for (const id of touched) await recomputeStock(tx, id);
    const [order] = await tx.insert(schema.orders).values({
      number: newNumber(), accessToken: randomBytes(16).toString("hex"), customerId: input.customerId ?? null,
      customerName: input.customerName, email: input.email, phone: input.phone,
      address: input.address, city: input.city, state: input.state, notes: input.notes ?? null,
      subtotalKobo: quote.subtotalKobo, shippingKobo: quote.shippingKobo, discountKobo: quote.discountKobo, totalKobo: quote.totalKobo, discountCode: quote.discountCode,
    }).returning();
    await tx.insert(schema.orderItems).values(quote.lines.map((l) => ({ ...l, orderId: order.id })));
    return order;
  });
}

export async function releaseStock(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
  if (!o?.stockReserved) return;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const i of items) await returnVariantStock(tx, i.productId, i.size, i.color, i.qty);
  for (const id of new Set(items.map((i) => i.productId))) await recomputeStock(tx, id);
  await tx.update(schema.orders).set({ stockReserved: false }).where(eq(schema.orders.id, orderId));
}

/** Re-reserve stock for an order whose window closed but whose money later arrived. */
export async function tryReserveStock(parent: Tx, orderId: number): Promise<boolean> {
  try {
    // nested transaction = savepoint, so a partial reservation is rolled back on failure
    await parent.transaction((tx) => reserveOrThrow(tx, orderId));
    return true;
  } catch (e) {
    if (e instanceof OrderError) return false;
    throw e;
  }
}

async function reserveOrThrow(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
  if (o.stockReserved) return;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const i of items) if (!(await takeVariantStock(tx, i.productId, i.size, i.color, i.qty))) throw new OrderError("out of stock");
  for (const id of new Set(items.map((i) => i.productId))) await recomputeStock(tx, id);
  await tx.update(schema.orders).set({ stockReserved: true }).where(eq(schema.orders.id, orderId));
}
