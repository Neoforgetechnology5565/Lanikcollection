import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySecondFactor } from "@/lib/adminAuth";
import { encryptSecret, newSecret, newRecoveryCodes, totpAt, stepAt } from "@/lib/totp";

async function admin() {
  const secret = newSecret(); const { plain, hashes } = newRecoveryCodes(3);
  const email = `adm${Date.now()}${Math.random().toString(36).slice(2, 5)}@t.test`;
  const [a] = await db.insert(schema.admins).values({ email, passwordHash: "x", totpEnabled: true, totpSecretEnc: encryptSecret(secret), recoveryHashes: hashes }).returning();
  return { a, secret, plain, email };
}
test("a valid authenticator code is accepted once; replaying it is refused", async () => {
  const { email, secret } = await admin(); const code = totpAt(secret, Date.now());
  assert.equal(await verifySecondFactor(email, code), true);
  assert.equal(await verifySecondFactor(email, code), false, "same code, same step: replay");
});
test("two simultaneous submissions of one code: exactly one succeeds", async () => {
  const { email, secret } = await admin(); const code = totpAt(secret, Date.now());
  const r = await Promise.all([1, 2, 3, 4].map(() => verifySecondFactor(email, code)));
  assert.equal(r.filter(Boolean).length, 1);
});
test("wrong, stale and malformed codes fail", async () => {
  const { email, secret } = await admin();
  assert.equal(await verifySecondFactor(email, "000000"), false); assert.equal(await verifySecondFactor(email, "12"), false);
  assert.equal(await verifySecondFactor(email, totpAt(secret, Date.now() - 5 * 60_000)), false);
  assert.equal(await verifySecondFactor("nobody@t.test", "123456"), false);
});
test("recovery codes work exactly once each (even under a race), case/dash-insensitive", async () => {
  const { email, plain, a } = await admin();
  const r = await Promise.all([1, 2, 3].map(() => verifySecondFactor(email, plain[0])));
  assert.equal(r.filter(Boolean).length, 1);
  assert.equal(await verifySecondFactor(email, plain[1].toUpperCase().replace("-", " ")), true);
  assert.equal(await verifySecondFactor(email, plain[1]), false);
  assert.equal((await db.select().from(schema.admins).where(eq(schema.admins.id, a.id)))[0].recoveryHashes.length, 1);
});
test("2FA that isn't enabled can never be satisfied by a code", async () => {
  const { email, secret, a } = await admin(); await db.update(schema.admins).set({ totpEnabled: false }).where(eq(schema.admins.id, a.id));
  assert.equal(await verifySecondFactor(email, totpAt(secret, Date.now())), false); void stepAt;
});
