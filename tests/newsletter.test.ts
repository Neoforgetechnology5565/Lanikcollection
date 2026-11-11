import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { subscribe, unsubscribeByToken, queueCampaign, campaignHtml, campaignStats } from "@/lib/newsletter";
import { retryPendingEmails } from "@/lib/mail";

let srv: http.Server; const sent: any[] = [];
const sfx = Math.random().toString(36).slice(2, 7);
const em = (n: string) => `${n}-${sfx}@news.test`;
before(async () => {
  srv = http.createServer((req, res) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { sent.push(JSON.parse(s || "{}")); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); }); });
  await new Promise<void>((r) => srv.listen(0, r)); process.env.RESEND_API_BASE = `http://localhost:${(srv.address() as { port: number }).port}`; process.env.RESEND_API_KEY = "re_test";
  // keep this test isolated from other files' leftovers
  await db.delete(schema.subscribers); await db.update(schema.emails).set({ status: "SENT" }).where(eq(schema.emails.status, "QUEUED"));
});
after(() => { srv.close(); delete process.env.RESEND_API_KEY; });

test("subscribe gives a token; re-subscribing after unsubscribing reactivates", async () => {
  await subscribe(em("a")); const [a] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, em("a")));
  assert.match(a.token!, /^[a-f0-9]{36}$/);
  assert.equal(await unsubscribeByToken(a.token!), true);
  assert.ok((await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, em("a"))))[0].unsubscribedAt);
  await subscribe(em("a")); const [b] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, em("a")));
  assert.equal(b.unsubscribedAt, null); assert.equal(b.token, a.token, "token is stable");
});
test("bad unsubscribe tokens do nothing", async () => { assert.equal(await unsubscribeByToken("x"), false); assert.equal(await unsubscribeByToken("0".repeat(36)), false); });

test("a campaign is queued only for active subscribers, with unsubscribe link + headers, and typed HTML is escaped", async () => {
  await subscribe(em("b")); await subscribe(em("c")); await subscribe(em("gone"));
  const [gone] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, em("gone"))); await unsubscribeByToken(gone.token!);
  const r = await queueCampaign({ subject: "Sale <b>now</b>", body: "Hello <script>alert(1)</script>\n\nSecond line", ctaLabel: "Shop", ctaUrl: "/shop?sale=1", adminEmail: "a@x.com" });
  assert.equal(r.queued, 3); // a, b, c  (gone excluded)
  const rows = await db.select().from(schema.emails).where(eq(schema.emails.campaignId, r.campaign.id));
  assert.ok(!rows.some((x) => x.toAddress === em("gone")));
  const mine = rows.find((x) => x.toAddress === em("b"))!;
  assert.ok(!mine.html.includes("<script>")); assert.ok(mine.html.includes("&lt;script&gt;")); assert.match(mine.html, /unsubscribe\?token=[a-f0-9]{36}/); assert.ok(mine.html.includes("/shop?sale=1"));
  assert.notEqual(rows[0].unsubUrl, rows[1].unsubUrl, "each recipient gets their own link");
  sent.length = 0; await retryPendingEmails(10);
  const m = sent.find((s) => s.to?.[0] === em("b"))!; assert.ok(m, "was delivered");
  assert.match(m.headers["List-Unsubscribe"], /\/api\/unsubscribe\?token=/); assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const st = (await campaignStats()).get(r.campaign.id)!; assert.equal(st.SENT, 3);
});
test("someone who unsubscribes AFTER queueing is skipped, not mailed", async () => {
  await subscribe(em("late")); const r = await queueCampaign({ subject: "Hi", body: "x", adminEmail: "a@x.com" });
  const [s] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, em("late"))); await unsubscribeByToken(s.token!);
  sent.length = 0; await retryPendingEmails(40);
  assert.ok(!sent.some((x) => x.to?.[0] === em("late"))); const st = (await campaignStats()).get(r.campaign.id)!; assert.ok((st.SKIPPED ?? 0) >= 1);
});
test("button links are restricted to safe URLs", () => {
  assert.ok(!campaignHtml("s", "b", "Go", "javascript:alert(1)", "https://x/u").includes("javascript:"));
  assert.ok(campaignHtml("s", "b", "Go", "https://example.com/x", "https://x/u").includes("https://example.com/x"));
});
