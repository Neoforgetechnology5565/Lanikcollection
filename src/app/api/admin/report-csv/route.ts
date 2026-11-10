import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/session";
import { buildReport, isDate, reportToCsv, ymd, type Group } from "@/lib/reports";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url); const f = u.searchParams.get("from") ?? undefined, t = u.searchParams.get("to") ?? undefined, g = u.searchParams.get("group");
  const to = isDate(t) ? t : ymd(new Date()); const from = isDate(f) ? f : ymd(new Date(Date.now() - 29 * 86400000));
  const group: Group = g === "week" || g === "month" ? g : "day";
  const r = await buildReport(from <= to ? from : to, from <= to ? to : from, group);
  return new NextResponse(reportToCsv(r), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sales-${r.from}-to-${r.to}.csv"` } });
}
