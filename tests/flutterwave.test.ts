import test from "node:test";
import assert from "node:assert/strict";
import { parseProviderExpiry } from "@/lib/flutterwave";

const now = Date.parse("2026-03-01T10:00:00Z");
test("ISO expiry with a timezone is trusted", () => {
  assert.equal(parseProviderExpiry("2026-03-01T11:30:00Z", now)?.toISOString(), "2026-03-01T11:30:00.000Z");
  assert.equal(parseProviderExpiry("2026-03-01T12:00:00+01:00", now)?.toISOString(), "2026-03-01T11:00:00.000Z");
});
test("zone-less formats are ambiguous and ignored (the admin-configured expiry applies instead)", () => {
  assert.equal(parseProviderExpiry("2026-03-01 11:30:00 AM", now), null);
  assert.equal(parseProviderExpiry("2026-03-01T11:30:00", now), null);
});
test("past, far-future and junk values are rejected", () => {
  assert.equal(parseProviderExpiry("2026-03-01T08:00:00Z", now), null);
  assert.equal(parseProviderExpiry("2026-03-02T10:00:00Z", now), null);
  for (const v of [null, undefined, 123, "", "soon", {}]) assert.equal(parseProviderExpiry(v as unknown, now), null);
});
