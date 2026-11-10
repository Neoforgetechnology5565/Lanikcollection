import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const TEMPLATE_KINDS = ["order_created", "order_paid", "order_processing", "order_shipped", "order_delivered", "order_cancelled"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export type Template = { subject: string; heading: string; body: string };

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  order_created: "Order received (awaiting payment)", order_paid: "Payment confirmed", order_processing: "Order processing",
  order_shipped: "Order shipped", order_delivered: "Order delivered", order_cancelled: "Order cancelled",
};
export const PLACEHOLDERS = ["{{customer_name}}", "{{order_number}}", "{{order_total}}", "{{order_status}}", "{{business_name}}"];

export const DEFAULT_TEMPLATES: Record<TemplateKind, Template> = {
  order_created: { subject: "We received your order {{order_number}}", heading: "Thanks, {{customer_name}}!", body: "Your order {{order_number}} is awaiting payment. Complete it before the payment window closes so we can reserve your items." },
  order_paid: { subject: "Payment confirmed: {{order_number}}", heading: "Payment confirmed", body: "Hi {{customer_name}}, we've received your payment of {{order_total}} for order {{order_number}}. We're getting it ready." },
  order_processing: { subject: "We're preparing order {{order_number}}", heading: "Order processing", body: "Hi {{customer_name}}, your order {{order_number}} is being prepared." },
  order_shipped: { subject: "Your order {{order_number}} is on its way", heading: "Order shipped", body: "Hi {{customer_name}}, great news: your order {{order_number}} has shipped." },
  order_delivered: { subject: "Your order {{order_number}} was delivered", heading: "Order delivered", body: "Hi {{customer_name}}, your order {{order_number}} has been delivered. Thank you for shopping with {{business_name}}!" },
  order_cancelled: { subject: "Your order {{order_number}} was cancelled", heading: "Order cancelled", body: "Hi {{customer_name}}, order {{order_number}} has been cancelled. If you paid, we'll contact you about your refund." },
};

export const kindForStatus = (status: string): TemplateKind | null =>
  ({ PROCESSING: "order_processing", SHIPPED: "order_shipped", DELIVERED: "order_delivered", CANCELLED: "order_cancelled", PAID: "order_paid" } as Record<string, TemplateKind>)[status] ?? null;

export async function getTemplates(): Promise<Record<TemplateKind, Template>> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "email_templates"));
  const v = (row?.value ?? {}) as Partial<Record<TemplateKind, Partial<Template>>>;
  return Object.fromEntries(TEMPLATE_KINDS.map((k) => [k, { ...DEFAULT_TEMPLATES[k], ...(v[k] ?? {}) }])) as Record<TemplateKind, Template>;
}
export async function saveTemplates(t: Record<TemplateKind, Template>) {
  await db.insert(schema.settings).values({ key: "email_templates", value: t }).onConflictDoUpdate({ target: schema.settings.key, set: { value: t } });
}

/** Replaces {{placeholders}} with values. Unknown placeholders are left as-is. `transform` lets callers HTML-escape. */
export function fill(text: string, vars: Record<string, string>, transform: (s: string) => string = (s) => s) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? transform(vars[k]) : m));
}
