import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, hotp, verifyTotp, totpAt, encryptSecret, decryptSecret, newRecoveryCodes, hashCode, newSecret, otpauthUrl } from "@/lib/totp";

const RFC_SECRET = Buffer.from("12345678901234567890"); // RFC 6238 test secret (SHA-1)
test("base32 round-trips and matches the RFC 4648 vector", () => {
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(base32Decode("MZXW6YTBOI").toString(), "foobar");
  const s = newSecret(); assert.equal(base32Encode(base32Decode(s)), s);
});
test("HOTP matches the RFC 4226 vectors", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map((c) => hotp(RFC_SECRET, c)), ["755224", "287082", "359152", "969429", "520489"]);
});
test("TOTP matches the RFC 6238 vectors (8 digits at t=59, 1111111109)", () => {
  const b32 = base32Encode(RFC_SECRET);
  assert.equal(totpAt(b32, 59_000, 8), "94287082"); assert.equal(totpAt(b32, 1111111109_000, 8), "07081804");
});
test("verifyTotp accepts ±1 step, rejects far codes, bad shapes and replays", () => {
  const b32 = base32Encode(RFC_SECRET); const now = 1111111109_000;
  const cur = totpAt(b32, now); const prev = totpAt(b32, now - 30_000); const far = totpAt(b32, now - 120_000);
  const step = verifyTotp(b32, cur, 0, now); assert.ok(step);
  assert.ok(verifyTotp(b32, prev, 0, now)); assert.equal(verifyTotp(b32, far, 0, now), null);
  assert.equal(verifyTotp(b32, cur, step!, now), null, "same code cannot be reused");
  assert.equal(verifyTotp(b32, "12345", 0, now), null); assert.equal(verifyTotp(b32, "abcdef", 0, now), null);
  assert.ok(verifyTotp(b32, cur.slice(0, 3) + " " + cur.slice(3), 0, now), "spaces in the typed code are fine");
});
test("secret encryption round-trips, is randomised, and tampering is detected", () => {
  const s = newSecret(); const a = encryptSecret(s), b = encryptSecret(s);
  assert.notEqual(a, b); assert.equal(decryptSecret(a), s);
  const parts = a.split("."); parts[2] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptSecret(parts.join(".")));
});
test("recovery codes: unique, hashed, case/dash-insensitive match", () => {
  const { plain, hashes } = newRecoveryCodes(); assert.equal(new Set(plain).size, 8);
  assert.equal(hashCode(plain[0].toUpperCase()), hashes[0]); assert.equal(hashCode(plain[1].replace("-", "")), hashes[1]);
  assert.ok(!hashes.includes(plain[0]), "plain text is never stored");
});
test("otpauth URL has what authenticator apps need", () => {
  const u = otpauthUrl("ABC234", "me@x.com"); assert.match(u, /^otpauth:\/\/totp\/LANIK%20COLLECTIONS:me%40x\.com\?secret=ABC234/); assert.match(u, /period=30/);
});
