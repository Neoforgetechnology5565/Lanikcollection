import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Fixed-window rate limiting stored in Postgres, so every server instance shares the same counters.
 * Keys look like "login:email:a@b.com" or "checkout:ip:1.2.3.4".
 */
export async function hit(key: string, windowSec: number): Promise<number> {
  const r = await db.execute(sql`
    INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  return Number((r.rows[0] as { count: number }).count);
}
export async function peek(key: string, windowSec: number): Promise<number> {
  const r = await db.execute(sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start >= now() - make_interval(secs => ${windowSec})`);
  return r.rows.length ? Number((r.rows[0] as { count: number }).count) : 0;
}
export async function reset(key: string) { await db.execute(sql`DELETE FROM rate_limits WHERE key = ${key}`); }
/** Count this attempt and report whether the caller is now over the limit. */
export async function limited(key: string, max: number, windowSec: number): Promise<boolean> { return (await hit(key, windowSec)) > max; }
export async function purgeRateLimits() { await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`); }

/**
 * Best-effort client IP. Only trust x-forwarded-for when the app sits behind a proxy that overwrites it
 * (Vercel, Cloudflare, nginx). Per-account keys (email) are the primary defence; IP limits are secondary.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
export const ipOf = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
