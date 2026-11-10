import { sql } from "drizzle-orm";
import { db } from "@/db";

export type Group = "day" | "week" | "month";
export const PAIDISH = sql`('PAID','PROCESSING','SHIPPED','DELIVERED')`;
const TZ = "Africa/Lagos";

export const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type Report = Awaited<ReturnType<typeof buildReport>>;

/**
 * Sales are counted by the day the money was verified (paid_at, Lagos time), for orders that are still
 * paid/in fulfilment. Cancelled orders drop out; refunds that were paid out in the range are shown separately.
 */
export async function buildReport(from: string, to: string, group: Group) {
  const paidDay = sql`(o.paid_at AT TIME ZONE ${TZ})::date`;
  const inRange = sql`${paidDay} BETWEEN ${from}::date AND ${to}::date AND o.status IN ${PAIDISH}`;
  const rows = async <T,>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

  const [t] = await rows<{ revenue: string; orders: number; discount: string; shipping: string }>(sql`
    SELECT COALESCE(SUM(o.total_kobo),0) AS revenue, COUNT(*)::int AS orders, COALESCE(SUM(o.discount_kobo),0) AS discount, COALESCE(SUM(o.shipping_kobo),0) AS shipping
    FROM orders o WHERE ${inRange}`);
  const [items] = await rows<{ units: number }>(sql`SELECT COALESCE(SUM(i.qty),0)::int AS units FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${inRange}`);
  const [ref] = await rows<{ total: string; n: number }>(sql`
    SELECT COALESCE(SUM(amount_kobo),0) AS total, COUNT(*)::int AS n FROM refunds
    WHERE status = 'PROCESSED' AND (processed_at AT TIME ZONE ${TZ})::date BETWEEN ${from}::date AND ${to}::date`);
  const [cust] = await rows<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM customers WHERE (created_at AT TIME ZONE ${TZ})::date BETWEEN ${from}::date AND ${to}::date`);

  const trunc = group === "month" ? sql`'month'` : group === "week" ? sql`'week'` : sql`'day'`;
  const series = await rows<{ period: string; revenue: string; orders: number }>(sql`
    SELECT to_char(date_trunc(${trunc}, ${paidDay}::timestamp), 'YYYY-MM-DD') AS period, SUM(o.total_kobo) AS revenue, COUNT(*)::int AS orders
    FROM orders o WHERE ${inRange} GROUP BY 1 ORDER BY 1`);
  const products = await rows<{ name: string; units: number; revenue: string }>(sql`
    SELECT i.name, SUM(i.qty)::int AS units, SUM(i.qty * i.unit_kobo) AS revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${inRange} GROUP BY i.name ORDER BY revenue DESC LIMIT 10`);
  const categories = await rows<{ name: string; units: number; revenue: string }>(sql`
    SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(i.qty)::int AS units, SUM(i.qty * i.unit_kobo) AS revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${inRange} GROUP BY 1 ORDER BY revenue DESC`);
  const methods = await rows<{ method: string; n: number; total: string }>(sql`
    SELECT p.method, COUNT(*)::int AS n, SUM(COALESCE(p.paid_amount_kobo, p.amount_kobo)) AS total
    FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'SUCCESSFUL' AND ${inRange} GROUP BY p.method ORDER BY total DESC`);
  const states = await rows<{ state: string; orders: number; revenue: string }>(sql`
    SELECT o.state, COUNT(*)::int AS orders, SUM(o.total_kobo) AS revenue FROM orders o WHERE ${inRange} GROUP BY o.state ORDER BY revenue DESC LIMIT 8`);
  const funnel = await rows<{ status: string; n: number }>(sql`
    SELECT o.status, COUNT(*)::int AS n FROM orders o WHERE (o.created_at AT TIME ZONE ${TZ})::date BETWEEN ${from}::date AND ${to}::date GROUP BY o.status`);

  const revenue = Number(t.revenue), refunded = Number(ref.total);
  return {
    from, to, group, revenue, orders: t.orders, aov: t.orders ? Math.round(revenue / t.orders) : 0, discount: Number(t.discount), shipping: Number(t.shipping),
    units: items.units, refunded, refundCount: ref.n, net: revenue - refunded, newCustomers: cust.n,
    series: series.map((s) => ({ period: s.period, revenue: Number(s.revenue), orders: s.orders })),
    products: products.map((p) => ({ ...p, revenue: Number(p.revenue) })), categories: categories.map((c) => ({ ...c, revenue: Number(c.revenue) })),
    methods: methods.map((m) => ({ ...m, total: Number(m.total) })), states: states.map((s) => ({ ...s, revenue: Number(s.revenue) })), funnel,
  };
}

const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export function reportToCsv(r: Report) {
  const out: (string | number)[][] = [["LANIK COLLECTIONS sales report", `${r.from} to ${r.to}`], [],
    ["Gross revenue (NGN)", r.revenue / 100], ["Orders", r.orders], ["Average order (NGN)", r.aov / 100], ["Units sold", r.units], ["Discounts given (NGN)", r.discount / 100], ["Shipping charged (NGN)", r.shipping / 100],
    ["Refunds paid out (NGN)", r.refunded / 100], ["Net revenue (NGN)", r.net / 100], ["New customers", r.newCustomers], [],
    [`Revenue by ${r.group}`, "Orders", "Revenue (NGN)"], ...r.series.map((s) => [s.period, s.orders, s.revenue / 100]), [],
    ["Top products", "Units", "Revenue (NGN)"], ...r.products.map((p) => [p.name, p.units, p.revenue / 100]), [],
    ["Category", "Units", "Revenue (NGN)"], ...r.categories.map((c) => [c.name, c.units, c.revenue / 100]), [],
    ["Payment method", "Payments", "Total (NGN)"], ...r.methods.map((m) => [m.method, m.n, m.total / 100]), [],
    ["State", "Orders", "Revenue (NGN)"], ...r.states.map((s) => [s.state, s.orders, s.revenue / 100])];
  return out.map((row) => row.map(cell).join(",")).join("\n");
}
