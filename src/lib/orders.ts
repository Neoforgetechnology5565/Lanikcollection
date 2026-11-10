import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { getSettings } from "./settings";

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

/** Prices are always recomputed from the database; the client's totals are never trusted. */
export async function createOrder(input: CheckoutInput) {
  const settings = await getSettings();
  if (!input.items.length) throw new OrderError("Your cart is empty");

  // merge duplicate lines
  const lines = new Map<string, CartLine>();
  for (const l of input.items) {
    const k = `${l.productId}|${l.size ?? ""}|${l.color ?? ""}`;
    const prev = lines.get(k);
    lines.set(k, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  const merged = [...lines.values()];

  return db.transaction(async (tx) => {
    const ids = [...new Set(merged.map((l) => l.productId))];
    const prods = await tx.select().from(schema.products).where(inArray(schema.products.id, ids));
    const byId = new Map(prods.map((p) => [p.id, p]));

    const items: (typeof schema.orderItems.$inferInsert)[] = [];
    let subtotal = 0;
    for (const l of merged) {
      const p = byId.get(l.productId);
      if (!p || !p.active) throw new OrderError("A product in your cart is no longer available");
      if (p.sizes.length && (!l.size || !p.sizes.includes(l.size))) throw new OrderError(`Choose a size for ${p.name}`);
      if (p.colors.length && (!l.color || !p.colors.includes(l.color))) throw new OrderError(`Choose a colour for ${p.name}`);
      // atomic reservation: never oversell
      const total = merged.filter((m) => m.productId === p.id).reduce((a, m) => a + m.qty, 0);
      const unit = unitPrice(p, total);
      subtotal += unit * l.qty;
      items.push({ orderId: 0, productId: p.id, name: p.name, size: l.size ?? null, color: l.color ?? null, qty: l.qty, unitKobo: unit });
    }
    for (const id of ids) {
      const qty = merged.filter((m) => m.productId === id).reduce((a, m) => a + m.qty, 0);
      const r = await tx.update(schema.products).set({ stock: sql`${schema.products.stock} - ${qty}` })
        .where(and(eq(schema.products.id, id), sql`${schema.products.stock} >= ${qty}`)).returning({ id: schema.products.id });
      if (!r.length) throw new OrderError(`Sorry, "${byId.get(id)!.name}" does not have enough stock`);
    }

    let discount = 0; let code: string | null = null;
    if (input.discountCode) {
      const [d] = await tx.select().from(schema.discountCodes)
        .where(and(eq(schema.discountCodes.code, input.discountCode.trim().toUpperCase()), eq(schema.discountCodes.active, true)));
      if (!d) throw new OrderError("That discount code is not valid");
      discount = Math.floor((subtotal * d.percent) / 100); code = d.code;
    }
    const shipping = settings.shippingFlatKobo;
    const total = subtotal - discount + shipping;

    const [order] = await tx.insert(schema.orders).values({
      number: newNumber(), accessToken: randomBytes(16).toString("hex"),
      customerName: input.customerName, email: input.email, phone: input.phone,
      address: input.address, city: input.city, state: input.state, notes: input.notes ?? null,
      subtotalKobo: subtotal, shippingKobo: shipping, discountKobo: discount, totalKobo: total, discountCode: code,
    }).returning();
    await tx.insert(schema.orderItems).values(items.map((i) => ({ ...i, orderId: order.id })));
    return order;
  });
}

export async function releaseStock(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
  if (!o?.stockReserved) return;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const i of items) {
    await tx.update(schema.products).set({ stock: sql`${schema.products.stock} + ${i.qty}` }).where(eq(schema.products.id, i.productId));
  }
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
  for (const i of items) {
    const r = await tx.update(schema.products).set({ stock: sql`${schema.products.stock} - ${i.qty}` })
      .where(and(eq(schema.products.id, i.productId), sql`${schema.products.stock} >= ${i.qty}`)).returning({ id: schema.products.id });
    if (!r.length) throw new OrderError("out of stock");
  }
  await tx.update(schema.orders).set({ stockReserved: true }).where(eq(schema.orders.id, orderId));
}
