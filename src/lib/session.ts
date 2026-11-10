import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";

const COOKIE = "lanik_admin";
const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
};

export async function createAdminSession(email: string) {
  const token = await new SignJWT({ email, role: "admin" }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("8h").sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600,
  });
}
export async function destroyAdminSession() { (await cookies()).delete(COOKIE); }

export async function getAdmin(): Promise<{ email: string } | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.role === "admin" ? { email: String(payload.email) } : null;
  } catch { return null; }
}

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
