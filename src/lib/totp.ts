import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---- RFC 4648 base32 (what authenticator apps expect) ----
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "")) {
    const i = ALPHA.indexOf(c); if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// ---- RFC 6238 TOTP (SHA-1, 30 s, 6 digits) ----
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}
export const stepAt = (ms: number) => Math.floor(ms / 1000 / 30);
export const totpAt = (secretB32: string, ms: number, digits = 6) => hotp(base32Decode(secretB32), stepAt(ms), digits);

/** Accepts the current code and one step either side (clock drift). Returns the matched step, or null. */
export function verifyTotp(secretB32: string, code: string, lastUsedStep = 0, now = Date.now()): number | null {
  const c = code.replace(/\s/g, ""); if (!/^\d{6}$/.test(c)) return null;
  const secret = base32Decode(secretB32); const cur = stepAt(now);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (step <= lastUsedStep) continue; // a code can be used once
    const want = Buffer.from(hotp(secret, step)); const got = Buffer.from(c);
    if (want.length === got.length && timingSafeEqual(want, got)) return step;
  }
  return null;
}
export const newSecret = () => base32Encode(randomBytes(20));
export const otpauthUrl = (secretB32: string, account: string, issuer = "LANIK COLLECTIONS") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// ---- encrypt the secret at rest (key derives from the same material as session signing) ----
function key(): Buffer {
  const m = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!m) throw new Error("Set SESSION_SECRET or DATABASE_URL");
  return createHash("sha256").update("lanik-2fa-v1:" + m).digest();
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ---- one-time recovery codes ----
export const hashCode = (c: string) => createHash("sha256").update(c.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
export function newRecoveryCodes(n = 8): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: n }, () => { const h = randomBytes(5).toString("hex"); return `${h.slice(0, 5)}-${h.slice(5)}`; });
  return { plain, hashes: plain.map(hashCode) };
}
