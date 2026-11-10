import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { expireDueOrders } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Schedule every 5 minutes (Vercel Cron, GitHub Actions, or `curl` from any scheduler):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/expire
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(secret), b = Buffer.from(given);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await expireDueOrders(100));
}
