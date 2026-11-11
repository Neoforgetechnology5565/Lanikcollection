import "server-only";
import nodemailer from "nodemailer";
import { and, eq, inArray, lt, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "./money";
import { fill, getTemplates, kindForStatus, type TemplateKind } from "./emailTemplates";
import { getSettings } from "./settings";
import { siteUrl } from "./siteUrl";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const FROM = () => process.env.MAIL_FROM ?? "LANIK COLLECTIONS <no-reply@lanikcollections.com>";

/** Which delivery provider is active: Resend (HTTPS API, serverless-friendly), SMTP, or none (messages stay QUEUED). */
export const mailProvider = () => (process.env.RESEND_API_KEY ? "resend" : process.env.SMTP_URL ? "smtp" : "none") as "resend" | "smtp" | "none";

async function transmit(to: string, subject: string, html: string, unsubUrl?: string | null) {
  const p = mailProvider();
  // one-click unsubscribe headers (Gmail/Yahoo expect these on marketing mail)
  const headers = unsubUrl ? { "List-Unsubscribe": `<${unsubUrl.replace("/unsubscribe?", "/api/unsubscribe?")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  if (p === "resend") {
    const base = process.env.RESEND_API_BASE ?? "https://api.resend.com";
    const r = await fetch(`${base}/emails`, { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM(), to: [to], subject, html, ...(headers ? { headers } : {}) }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  } else if (p === "smtp") {
    await nodemailer.createTransport(process.env.SMTP_URL!).sendMail({ from: FROM(), to, subject, html, ...(headers ? { headers } : {}) });
  }
}

/** Attempt delivery of a stored email and record the outcome. Never throws. */
export async function deliver(id: number): Promise<"SENT" | "FAILED" | "QUEUED" | "SKIPPED"> {
  try {
    const [row] = await db.select().from(schema.emails).where(eq(schema.emails.id, id));
    if (!row) return "FAILED";
    if (mailProvider() === "none") return "QUEUED";
    if (row.kind === "campaign") { // never mail someone who unsubscribed after the campaign was queued
      const [sub] = await db.select({ u: schema.subscribers.unsubscribedAt }).from(schema.subscribers).where(eq(schema.subscribers.email, row.toAddress));
      if (!sub || sub.u) { await db.update(schema.emails).set({ status: "SKIPPED", error: "unsubscribed" }).where(eq(schema.emails.id, id)); return "SKIPPED"; }
    }
    try {
      await transmit(row.toAddress, row.subject, row.html, row.unsubUrl);
      await db.update(schema.emails).set({ status: "SENT", sentAt: new Date(), error: null, attempts: sql`${schema.emails.attempts} + 1` }).where(eq(schema.emails.id, id));
      return "SENT";
    } catch (e) {
      await db.update(schema.emails).set({ status: "FAILED", error: String((e as Error).message).slice(0, 300), attempts: sql`${schema.emails.attempts} + 1` }).where(eq(schema.emails.id, id));
      return "FAILED";
    }
  } catch (e) { console.error("deliver", e); return "FAILED"; }
}

/** Store the message (always visible in Admin → Emails), then try to send it. Never throws: email must not break checkout. */
export async function sendMail(to: string, subject: string, html: string, kind = "misc") {
  try { const [row] = await db.insert(schema.emails).values({ toAddress: to, subject, html, kind }).returning(); await deliver(row.id); }
  catch (e) { console.error("sendMail", e); }
}

/** For the scheduler: retry messages that are stuck QUEUED (provider was missing) or FAILED, up to 5 attempts within 3 days. */
export async function retryPendingEmails(limit = 25) {
  if (mailProvider() === "none") return { retried: 0, sent: 0 };
  // order mail first, marketing last; marketing is paced (~2/second) to respect provider rate limits
  const rows = await db.select({ id: schema.emails.id, kind: schema.emails.kind }).from(schema.emails)
    .where(and(inArray(schema.emails.status, ["QUEUED", "FAILED"]), lt(schema.emails.attempts, 5), gt(schema.emails.createdAt, sql`now() - interval '14 days'`)))
    .orderBy(sql`(${schema.emails.kind} = 'campaign')`, schema.emails.id).limit(limit);
  let sent = 0;
  for (const r of rows) { if ((await deliver(r.id)) === "SENT") sent++; if (r.kind === "campaign") await new Promise((res) => setTimeout(res, 550)); }
  return { retried: rows.length, sent };
}
/** Admin "Resend": works on any stored message, including ones already SENT. */
export async function resendEmail(id: number) { await db.update(schema.emails).set({ attempts: 0 }).where(eq(schema.emails.id, id)); return deliver(id); }

export const shell = (title: string, body: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e9d5b5">
<div style="background:#0B0907;color:#F5C45E;padding:20px;text-align:center;letter-spacing:.3em;font-family:Georgia,serif;font-size:22px">LANIK COLLECTIONS</div>
<div style="padding:24px;color:#0B0907"><h2 style="font-family:Georgia,serif">${title}</h2>${body}</div></div>`;
const button = (href: string, label: string) => `<p><a href="${esc(href)}" style="background:#D99A24;color:#0B0907;padding:12px 20px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;

async function loadOrder(orderId: number) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const rows = items.map((i) => `<tr><td>${esc(i.name)} ×${i.qty} ${esc([i.size, i.color].filter(Boolean).join(" · "))}</td><td style="text-align:right">${naira(i.unitKobo * i.qty)}</td></tr>`).join("");
  const link = `${siteUrl()}/order/${o.number}?k=${o.accessToken}`;
  return { o, table: `<table style="width:100%;font-size:14px">${rows}<tr><td><b>Total</b></td><td style="text-align:right"><b>${naira(o.totalKobo)}</b></td></tr></table>`, link };
}

/** Order emails use the admin-editable templates (Admin → Email templates). Placeholder values are HTML-escaped. */
export async function mailOrder(orderId: number, kind: TemplateKind) {
  const [{ o, table, link }, templates, s] = await Promise.all([loadOrder(orderId), getTemplates(), getSettings()]);
  const t = templates[kind];
  const vars = { customer_name: o.customerName, order_number: o.number, order_total: naira(o.totalKobo), order_status: o.status.replace("_", " ").toLowerCase(), business_name: s.businessName };
  const paragraphs = fill(t.body, vars, esc).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  await sendMail(o.email, fill(t.subject, vars), shell(fill(t.heading, vars, esc), `${paragraphs}${table}${button(link, kind === "order_created" ? "View order / complete payment" : "View your order")}`), kind);
}
export const mailOrderCreated = (id: number) => mailOrder(id, "order_created");
export const mailOrderPaid = (id: number) => mailOrder(id, "order_paid");
export async function mailOrderStatus(orderId: number) {
  const [o] = await db.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId));
  const k = o && kindForStatus(o.status); if (k) await mailOrder(orderId, k);
}

export async function mailVerifyEmail(to: string, name: string, link: string) {
  await sendMail(to, "Confirm your email address", shell("Confirm your email", `<p>Hi ${esc(name)}, please confirm your email to unlock your order history.</p>${button(link, "Confirm email")}<p style="font-size:12px;color:#666">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>`), "verify");
}
export async function mailPasswordReset(to: string, name: string, link: string) {
  await sendMail(to, "Reset your password", shell("Reset your password", `<p>Hi ${esc(name)}, use the button below to choose a new password.</p>${button(link, "Choose a new password")}<p style="font-size:12px;color:#666">This link expires in 1 hour and works once. If you didn't ask for this, you can ignore it; your password won't change.</p>`), "reset");
}
