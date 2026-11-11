import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";

const COOKIE = "lanik_admin";
// SESSION_SECRET is recommended. If it is not set we derive one from DATABASE_URL, which already contains
// the database password and so is just as secret. (Changing either one signs everyone out.)
const key = () => {
  let s = process.env.SESSION_SECRET;
  if (s && s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters (or leave it unset)");
  if (!s) {
    if (!process.env.DATABASE_URL) throw new Error("Set SESSION_SECRET or DATABASE_URL");
    s = createHash("sha256").update("lanik-session-v1:" + process.env.DATABASE_URL).digest("hex");
  }
  return new TextEncoder().encode(s);
};

export async function createAdminSession(email: string, version: number) {
  const token = await new SignJWT({ email, v: version, role: "admin" }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("8h").sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600,
  });
}
export async function destroyAdminSession() { (await cookies()).delete(COOKIE); }

/** Valid only while the admin still exists and their tokenVersion matches (changing the password signs out all other sessions). */
export async function getAdmin(): Promise<{ email: string; id: number } | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    if (payload.role !== "admin") return null;
    const { db, schema } = await import("@/db"); const { eq } = await import("drizzle-orm");
    const [a] = await db.select({ id: schema.admins.id, v: schema.admins.tokenVersion }).from(schema.admins).where(eq(schema.admins.email, String(payload.email)));
    return a && a.v === Number(payload.v ?? 0) ? { email: String(payload.email), id: a.id } : null;
  } catch { return null; }
}

// Between the password step and the 6-digit code step the admin holds only this short-lived, single-purpose cookie.
const P2 = "lanik_admin_2fa";
export async function createPending2fa(email: string, version: number) {
  const token = await new SignJWT({ email, v: version, role: "admin-2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(key());
  (await cookies()).set(P2, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: 300 });
}
export async function getPending2fa(): Promise<{ email: string; v: number } | null> {
  const t = (await cookies()).get(P2)?.value; if (!t) return null;
  try { const { payload } = await jwtVerify(t, key()); return payload.role === "admin-2fa" ? { email: String(payload.email), v: Number(payload.v ?? 0) } : null; } catch { return null; }
}
export async function clearPending2fa() { (await cookies()).delete(P2); }

/** Call at the top of every admin page, server action and route handler. */
export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

// ---- customers ----
const CCOOKIE = "lanik_customer";
export async function createCustomerSession(id: number, version: number) {
  const token = await new SignJWT({ cid: id, v: version, role: "customer" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
  (await cookies()).set(CCOOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
}
export async function destroyCustomerSession() { (await cookies()).delete(CCOOKIE); }
/** Valid only while the customer's tokenVersion matches, so a password change/reset signs out every other device. */
export async function getCustomerId(): Promise<number | null> {
  const t = (await cookies()).get(CCOOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    if (payload.role !== "customer") return null;
    const { db, schema } = await import("@/db"); const { eq } = await import("drizzle-orm");
    const [c] = await db.select({ v: schema.customers.tokenVersion }).from(schema.customers).where(eq(schema.customers.id, Number(payload.cid)));
    return c && c.v === Number(payload.v ?? 0) ? Number(payload.cid) : null;
  } catch { return null; }
}
