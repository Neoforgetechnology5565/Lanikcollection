import Link from "next/link";
import { buildReport, isDate, ymd, type Group } from "@/lib/reports";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
const Stat = ({ l, v, sub }: { l: string; v: string | number; sub?: string }) => <div className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">{l}</p><p className="font-serif text-2xl font-bold mt-1">{v}</p>{sub && <p className="text-xs text-ink/50">{sub}</p>}</div>;

function Bars({ data }: { data: { period: string; revenue: number }[] }) {
  if (!data.length) return <p className="text-sm text-ink/60">No paid orders in this range.</p>;
  const max = Math.max(...data.map((d) => d.revenue), 1); const w = Math.max(12, Math.min(48, Math.floor(900 / data.length) - 4));
  return (
    <div className="overflow-x-auto"><svg role="img" aria-label="Revenue over time" width={Math.max(300, data.length * (w + 4))} height="190" className="block">
      {data.map((d, i) => { const h = Math.max(2, (d.revenue / max) * 140); return <g key={d.period}><rect x={i * (w + 4)} y={150 - h} width={w} height={h} fill="#D99A24"><title>{`${d.period}: ${naira(d.revenue)}`}</title></rect>
        {(data.length <= 16 || i % Math.ceil(data.length / 12) === 0) && <text x={i * (w + 4) + w / 2} y="170" textAnchor="middle" fontSize="9" fill="#5b4a2e">{d.period.slice(5)}</text>}</g>; })}
    </svg></div>
  );
}
const Table = ({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) => (
  <section className="card p-4"><h2 className="font-semibold mb-2">{title}</h2>{rows.length === 0 ? <p className="text-sm text-ink/60">No data.</p> :
    <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-ink/50"><tr>{head.map((h, i) => <th key={h} className={`py-1 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-champagne">{r.map((c, j) => <td key={j} className={`py-1.5 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody></table>}</section>
);

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const sp = await searchParams; const today = new Date();
  const to = isDate(sp.to) ? sp.to : ymd(today); const from = isDate(sp.from) ? sp.from : ymd(new Date(today.getTime() - 29 * 86400000));
  const group: Group = sp.group === "week" || sp.group === "month" ? sp.group : "day";
  const r = await buildReport(from <= to ? from : to, from <= to ? to : from, group);
  const preset = (days: number) => `/admin/reports?from=${ymd(new Date(today.getTime() - (days - 1) * 86400000))}&to=${ymd(today)}&group=${days > 120 ? "month" : days > 45 ? "week" : "day"}`;
  const qs = `from=${r.from}&to=${r.to}&group=${group}`;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap"><h1 className="font-serif text-3xl font-bold">Sales reports</h1><Link className="btn btn-line !py-1.5" href={`/api/admin/report-csv?${qs}`}>Export CSV</Link></div>
      <form className="card p-4 flex flex-wrap gap-3 items-end"><div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={r.from} className="input" /></div><div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={r.to} className="input" /></div>
        <div><label className="label" htmlFor="group">Group by</label><select id="group" name="group" defaultValue={group} className="input"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></div>
        <button className="btn btn-dark">Apply</button>
        <span className="text-xs flex gap-3 ml-auto">{[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, l]) => <Link key={l} className="underline" href={preset(d as number)}>{l}</Link>)}</span></form>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat l="Gross revenue" v={naira(r.revenue)} sub={`${r.orders} paid order${r.orders === 1 ? "" : "s"}`} /><Stat l="Refunds paid out" v={naira(r.refunded)} sub={`${r.refundCount} refund${r.refundCount === 1 ? "" : "s"}`} /><Stat l="Net revenue" v={naira(r.net)} /><Stat l="Average order" v={naira(r.aov)} />
        <Stat l="Units sold" v={r.units} /><Stat l="Discounts given" v={naira(r.discount)} /><Stat l="Shipping charged" v={naira(r.shipping)} /><Stat l="New customers" v={r.newCustomers} /></div>
      <section className="card p-4"><h2 className="font-semibold mb-3">Revenue by {group}</h2><Bars data={r.series} /></section>
      <div className="grid lg:grid-cols-2 gap-5">
        <Table title="Top products" head={["Product", "Units", "Revenue"]} rows={r.products.map((p) => [p.name, p.units, naira(p.revenue)])} />
        <Table title="By category" head={["Category", "Units", "Revenue"]} rows={r.categories.map((c) => [c.name, c.units, naira(c.revenue)])} />
        <Table title="By payment method" head={["Method", "Payments", "Total"]} rows={r.methods.map((m) => [m.method, m.n, naira(m.total)])} />
        <Table title="Top states" head={["State", "Orders", "Revenue"]} rows={r.states.map((s) => [s.state, s.orders, naira(s.revenue)])} />
      </div>
      <Table title="Orders created in this range, by status" head={["Status", "Orders"]} rows={r.funnel.map((f) => [f.status.replace("_", " "), f.n])} />
      <p className="text-xs text-ink/50">Revenue counts orders by the day payment was verified (Lagos time) and excludes cancelled orders. Refunds are shown on the day they were paid out.</p>
    </div>
  );
}
