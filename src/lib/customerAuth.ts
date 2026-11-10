import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteUrl } from "./siteUrl";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Single-use, expiring token. Only the hash is stored. Issuing a new one revokes older unused ones of the same kind. */
export async function issueToken(customerId: number, kind: "verify" | "reset", ttlMinutes: number) {
  const raw = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx.update(schema.authTokens).set({ usedAt: new Date() })
      .where(and(eq(schema.authTokens.customerId, customerId), eq(schema.authTokens.kind, kind), isNull(schema.authTokens.usedAt)));
    await tx.insert(schema.authTokens).values({ customerId, kind, tokenHash: sha(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) });
  });
  return raw;
}
export async function tokenIsValid(raw: string, kind: "verify" | "reset") {
  if (!/^[a-f0-9]{64}$/.test(raw)) return false;
  const [t] = await db.select({ id: schema.authTokens.id }).from(schema.authTokens)
    .where(and(eq(schema.authTokens.tokenHash, sha(raw)), eq(schema.authTokens.kind, kind), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, sql`now()`)));
  return !!t;
}
/** Atomically spends the token. Returns the customer id, or null if invalid/used/expired. */
export async function consumeToken(raw: string, kind: "verify" | "reset"): Promise<number | null> {
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const r = await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.tokenHash, sha(raw)), eq(schema.authTokens.kind, kind), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, sql`now()`)))
    .returning({ customerId: schema.authTokens.customerId });
  return r[0]?.customerId ?? null;
}
export const appUrl = () => siteUrl();
