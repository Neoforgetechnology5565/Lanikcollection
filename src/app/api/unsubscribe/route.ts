import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/newsletter";
export const dynamic = "force-dynamic";
// RFC 8058 one-click unsubscribe: mail apps POST here. (A plain GET does nothing, so link scanners can't unsubscribe people.)
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return (await unsubscribeByToken(token)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "invalid" }, { status: 400 });
}
