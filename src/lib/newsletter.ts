import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { esc, shell } from "./mail";
import { siteUrl } from "./siteUrl";
import { safeHref } from "./content";

const newToken = () => randomBytes(18).toString("hex");

/** Sign up (or re-subscribe). Always leaves the address with an unsubscribe token. */
export async function subscribe(email: string) {
  await db.insert(schema.subscribers).values({ email, token: newToken() })
    .onConflictDoUpdate({ target: schema.subscribers.email, set: { unsubscribedAt: null } });
  await db.update(schema.subscribers).set({ token: newToken() }).where(and(eq(schema.subscribers.email, email), isNull(schema.subscribers.token)));
}
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{36}$/.test(token)) return false;
  const r = await db.update(schema.subscribers).set({ unsubscribedAt: new Date() }).where(eq(schema.subscribers.token, token)).returning({ e: schema.subscribers.email });
  return r.length > 0;
}
export const unsubscribeUrl = (token: string) => `${siteUrl()}/unsubscribe?token=${token}`;

/** Plain-text body -> paragraphs (escaped, so nothing typed in the admin can inject HTML). */
export function campaignHtml(subject: string, body: string, ctaLabel: string | null, ctaUrl: string | null, unsubUrl: string) {
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const href = ctaUrl ? (safeHref(ctaUrl).startsWith("/") ? siteUrl() + safeHref(ctaUrl) : safeHref(ctaUrl)) : "";
  const btn = ctaLabel && href ? `<p><a href="${esc(href)}" style="background:#D99A24;color:#0B0907;padding:12px 20px;text-decoration:none;font-weight:bold">${esc(ctaLabel)}</a></p>` : "";
  const foot = `<hr style="border:0;border-top:1px solid #e9d5b5;margin:24px 0"><p style="font-size:12px;color:#777">You're receiving this because you subscribed to LANIK COLLECTIONS. <a href="${esc(unsubUrl)}">Unsubscribe</a></p>`;
  return shell(esc(subject), paras + btn + foot);
}

/**
 * Queue a campaign: one stored email per ACTIVE subscriber (never anyone who unsubscribed). They are then
 * delivered in small batches by the scheduler or the "Send next batch" button, which keeps within provider limits.
 */
export async function queueCampaign(a: { subject: string; body: string; ctaLabel?: string; ctaUrl?: string; adminEmail: string }) {
  const subs = await db.select().from(schema.subscribers).where(isNull(schema.subscribers.unsubscribedAt));
  const [c] = await db.insert(schema.campaigns).values({ subject: a.subject, body: a.body, ctaLabel: a.ctaLabel || null, ctaUrl: a.ctaUrl || null, recipients: subs.length, createdBy: a.adminEmail }).returning();
  const rows = [];
  for (const s of subs) {
    let token = s.token;
    if (!token) { token = newToken(); await db.update(schema.subscribers).set({ token }).where(eq(schema.subscribers.email, s.email)); }
    const url = unsubscribeUrl(token);
    rows.push({ toAddress: s.email, subject: a.subject, html: campaignHtml(a.subject, a.body, a.ctaLabel ?? null, a.ctaUrl ?? null, url), kind: "campaign", campaignId: c.id, unsubUrl: url });
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.emails).values(rows.slice(i, i + 500));
  return { campaign: c, queued: rows.length };
}

export async function campaignStats() {
  const r = await db.execute(sql`SELECT campaign_id, status, COUNT(*)::int AS n FROM emails WHERE campaign_id IS NOT NULL GROUP BY 1, 2`);
  const m = new Map<number, Record<string, number>>();
  for (const x of r.rows as { campaign_id: number; status: string; n: number }[]) m.set(x.campaign_id, { ...(m.get(x.campaign_id) ?? {}), [x.status]: x.n });
  return m;
}
export { isNotNull };
