import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hit, peek, reset, limited } from "@/lib/ratelimit";
import { issueToken, consumeToken, tokenIsValid } from "@/lib/customerAuth";

const sfx = Math.random().toString(36).slice(2, 8);

test("rate limiter counts per key inside a window and resets", async () => {
  const k = `t:${sfx}:a`;
  assert.equal(await peek(k, 60), 0);
  assert.equal(await hit(k, 60), 1); assert.equal(await hit(k, 60), 2);
  assert.equal(await peek(k, 60), 2);
  await reset(k); assert.equal(await peek(k, 60), 0);
});
test("limited() trips after max attempts; other keys are unaffected", async () => {
  const k = `t:${sfx}:b`;
  for (let i = 0; i < 3; i++) assert.equal(await limited(k, 3, 60), false);
  assert.equal(await limited(k, 3, 60), true);
  assert.equal(await limited(`t:${sfx}:other`, 3, 60), false);
});
test("rate limiter is atomic under concurrency (shared across instances)", async () => {
  const k = `t:${sfx}:c`;
  const counts = await Promise.all(Array.from({ length: 25 }, () => hit(k, 60)));
  assert.equal(Math.max(...counts), 25); assert.equal(new Set(counts).size, 25);
});
test("an expired window starts over", async () => {
  const k = `t:${sfx}:d`; await hit(k, 60); await hit(k, 60);
  await db.update(schema.rateLimits).set({ windowStart: new Date(Date.now() - 120_000) }).where(eq(schema.rateLimits.key, k));
  assert.equal(await peek(k, 60), 0); assert.equal(await hit(k, 60), 1);
});

async function customer() {
  const [c] = await db.insert(schema.customers).values({ email: `c${sfx}${Math.random().toString(36).slice(2, 5)}@e.com`, name: "T", passwordHash: "x" }).returning();
  return c;
}
test("auth tokens are single-use", async () => {
  const c = await customer(); const t = await issueToken(c.id, "reset", 60);
  assert.equal(await tokenIsValid(t, "reset"), true);
  assert.equal(await consumeToken(t, "reset"), c.id);
  assert.equal(await consumeToken(t, "reset"), null); assert.equal(await tokenIsValid(t, "reset"), false);
});
test("concurrent redemption of one token succeeds exactly once", async () => {
  const c = await customer(); const t = await issueToken(c.id, "verify", 60);
  const r = await Promise.all([consumeToken(t, "verify"), consumeToken(t, "verify"), consumeToken(t, "verify")]);
  assert.equal(r.filter((x) => x === c.id).length, 1);
});
test("tokens expire, are kind-specific, and a newer token revokes the older", async () => {
  const c = await customer();
  const old = await issueToken(c.id, "reset", 60); const fresh = await issueToken(c.id, "reset", 60);
  assert.equal(await consumeToken(old, "reset"), null); assert.equal(await tokenIsValid(fresh, "verify"), false);
  await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authTokens.customerId, c.id));
  assert.equal(await consumeToken(fresh, "reset"), null);
  assert.equal(await consumeToken("not-a-token", "reset"), null);
});
