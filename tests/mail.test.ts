import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendMail, retryPendingEmails, resendEmail, mailOrder, mailProvider } from "@/lib/mail";
import { createOrder } from "@/lib/orders";
import { syncVariants } from "@/lib/catalog";
import { saveTemplates, getTemplates, fill, DEFAULT_TEMPLATES } from "@/lib/emailTemplates";

let srv: http.Server; const got: { auth?: string; body: any }[] = []; let fail = false;
before(async () => {
  srv = http.createServer((req, res) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { got.push({ auth: req.headers.authorization, body: JSON.parse(s || "{}") }); res.writeHead(fail ? 500 : 200, { "content-type": "application/json" }); res.end(fail ? '{"message":"boom"}' : '{"id":"1"}'); }); });
  await new Promise<void>((r) => srv.listen(0, r)); const port = (srv.address() as { port: number }).port;
  process.env.RESEND_API_BASE = `http://localhost:${port}`;
});
after(() => srv.close());
const last = async () => (await db.select().from(schema.emails).orderBy(desc(schema.emails.id)).limit(1))[0];

test("no provider: message is recorded as QUEUED and nothing is sent", async () => {
  delete process.env.RESEND_API_KEY; delete process.env.SMTP_URL; assert.equal(mailProvider(), "none");
  await sendMail("a@b.com", "Hi", "<p>x</p>"); assert.equal((await last()).status, "QUEUED"); assert.equal(got.length, 0);
});
test("Resend provider: queued mail is delivered by the retry job", async () => {
  process.env.RESEND_API_KEY = "re_test"; assert.equal(mailProvider(), "resend");
  const r = await retryPendingEmails(); assert.ok(r.sent >= 1);
  const mine = got.find((g) => g.body.subject === "Hi" && g.body.to?.[0] === "a@b.com"); // the shared test DB may hold other queued mail
  assert.ok(mine); assert.equal(mine!.auth, "Bearer re_test");
});
test("failure is recorded with attempts, then admin resend succeeds", async () => {
  fail = true; await sendMail("c@d.com", "Boom", "<p>y</p>");
  let e = await last(); assert.equal(e.status, "FAILED"); assert.equal(e.attempts, 1); assert.match(e.error!, /500/);
  fail = false; assert.equal(await resendEmail(e.id), "SENT");
  e = (await db.select().from(schema.emails).where(eq(schema.emails.id, e.id)))[0]; assert.equal(e.status, "SENT"); assert.ok(e.sentAt);
});
test("emails stop retrying after 5 attempts", async () => {
  fail = true; await sendMail("e@f.com", "Stuck", "<p>z</p>"); const e = await last();
  await db.update(schema.emails).set({ attempts: 5 }).where(eq(schema.emails.id, e.id));
  const before = got.length; await retryPendingEmails(); assert.equal(got.filter((_, i) => i >= before && _.body.subject === "Stuck").length, 0); fail = false;
});

test("templates: placeholders are filled, and customer-controlled values are HTML-escaped", async () => {
  assert.equal(fill("Hi {{customer_name}} {{nope}}", { customer_name: "Ada" }), "Hi Ada {{nope}}");
  const [p] = await db.insert(schema.products).values({ slug: `m-${Date.now()}`, name: "Mail Polo", priceKobo: 100000 }).returning(); await syncVariants(db, p.id, [], [], 5);
  const o = await createOrder({ customerName: `<script>alert(1)</script>`, email: "x@y.com", phone: "0801234567", address: "1 Road St", city: "Ikeja", state: "Lagos", items: [{ productId: p.id, qty: 1 }] });
  await saveTemplates({ ...(await getTemplates()), order_shipped: { subject: "Shipped {{order_number}}", heading: "On the way, {{customer_name}}", body: "Order {{order_number}} ({{order_total}}).\n\nSecond paragraph." } });
  await mailOrder(o.id, "order_shipped"); const e = await last();
  assert.equal(e.subject, `Shipped ${o.number}`); assert.ok(!e.html.includes("<script>")); assert.ok(e.html.includes("&lt;script&gt;")); assert.ok(e.html.includes("Second paragraph.")); assert.ok(e.html.includes(o.accessToken));
  await saveTemplates(DEFAULT_TEMPLATES);
});
