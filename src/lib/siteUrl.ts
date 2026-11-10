/**
 * The public address of the site, e.g. https://lanikcollections.com (no trailing slash).
 * Order: APP_URL if you set it, else the address Vercel gives the project, else the request's own origin,
 * else localhost. So on Vercel it works with no setting at all; set APP_URL once you add your own domain.
 */
export function siteUrl(requestUrl?: string): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (v) return `https://${v}`;
  if (requestUrl) { try { return new URL(requestUrl).origin; } catch { /* fall through */ } }
  return "http://localhost:3000";
}
