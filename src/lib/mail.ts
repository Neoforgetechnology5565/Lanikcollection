import "server-only";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "./money";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * Queue-then-send. Every message is stored in the `emails` table (visible in Admin → Emails).
 * If SMTP_URL is set it is delivered; otherwise it stays QUEUED. Never throws: email must not break checkout.
 */
export async function sendMail(to: string, subject: string, html: string) {
  try {
    const [row] = await db.insert(schema.emails).values({ toAddress: to, subject, html }).returning();
    const url = process.env.SMTP_URL;
    if (!url) return;
    try {
      await nodemailer.createTransport(url).sendMail({ from: process.env.MAIL_FROM ?? "LANIK COLLECTIONS <no-reply@lanikcollections.com>", to, subject, html });
      await db.update(schema.emails).set({ status: "SENT" }).where(eq(schema.emails.id, row.id));
    } catch (e) {
      await db.update(schema.emails).set({ status: "FAILED", error: String((e as Error).message).slice(0, 300) }).where(eq(schema.emails.id, row.id));
    }
  } catch (e) { console.error("sendMail", e); }
}

const shell = (title: string, body: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e9d5b5">
<div style="background:#0B0907;color:#F5C45E;padding:20px;text-align:center;letter-spacing:.3em;font-family:Georgia,serif;font-size:22px">LANIK COLLECTIONS</div>
<div style="padding:24px;color:#0B0907"><h2 style="font-family:Georgia,serif">${title}</h2>${body}</div></div>`;

async function load(orderId: number) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const rows = items.map((i) => `<tr><td>${esc(i.name)} ×${i.qty} ${esc([i.size, i.color].filter(Boolean).join(" · "))}</td><td style="text-align:right">${naira(i.unitKobo * i.qty)}</td></tr>`).join("");
  const link = `${process.env.APP_URL ?? ""}/order/${o.number}?k=${o.accessToken}`;
  return { o, table: `<table style="width:100%;font-size:14px">${rows}<tr><td><b>Total</b></td><td style="text-align:right"><b>${naira(o.totalKobo)}</b></td></tr></table>`, link };
}

export async function mailOrderCreated(orderId: number) {
  const { o, table, link } = await load(orderId);
  await sendMail(o.email, `We received your order ${o.number}`, shell(`Thanks, ${esc(o.customerName)}!`,
    `<p>Your order <b>${esc(o.number)}</b> is awaiting payment.</p>${table}<p><a href="${esc(link)}">View or complete payment</a></p>`));
}
export async function mailOrderPaid(orderId: number) {
  const { o, table, link } = await load(orderId);
  await sendMail(o.email, `Payment confirmed: ${o.number}`, shell("Payment confirmed",
    `<p>Hi ${esc(o.customerName)}, we've received your payment for order <b>${esc(o.number)}</b>.</p>${table}<p><a href="${esc(link)}">Track your order</a></p>`));
}
export async function mailOrderStatus(orderId: number) {
  const { o, link } = await load(orderId);
  await sendMail(o.email, `Your order ${o.number} is ${o.status.toLowerCase()}`, shell(`Order ${esc(o.status.toLowerCase())}`,
    `<p>Hi ${esc(o.customerName)}, your order <b>${esc(o.number)}</b> is now <b>${esc(o.status)}</b>.</p><p><a href="${esc(link)}">View order</a></p>`));
}
