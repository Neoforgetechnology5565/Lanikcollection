import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_KINDS, TEMPLATE_LABELS, getTemplates, saveTemplates, type TemplateKind } from "@/lib/emailTemplates";

export const dynamic = "force-dynamic";
async function save(fd: FormData) {
  "use server"; await requireAdmin();
  const out = {} as Record<TemplateKind, { subject: string; heading: string; body: string }>;
  for (const k of TEMPLATE_KINDS) {
    const d = DEFAULT_TEMPLATES[k];
    out[k] = { subject: String(fd.get(`${k}_subject`) ?? "").trim().slice(0, 150) || d.subject, heading: String(fd.get(`${k}_heading`) ?? "").trim().slice(0, 100) || d.heading, body: String(fd.get(`${k}_body`) ?? "").trim().slice(0, 1200) || d.body };
  }
  await saveTemplates(out); revalidatePath("/admin/email-templates");
}
export default async function Templates() {
  const t = await getTemplates();
  return (
    <form action={save} className="space-y-5 max-w-3xl">
      <h1 className="font-serif text-3xl font-bold">Email templates</h1>
      <p className="text-sm text-ink/70">Sent to customers when an order changes status. You can use: {PLACEHOLDERS.map((p) => <code key={p} className="bg-champagne/60 px-1 mr-1">{p}</code>)}. The order items table and a &ldquo;View order&rdquo; button are added automatically. Leave a field blank to restore its default.</p>
      {TEMPLATE_KINDS.map((k) => (
        <section key={k} className="card p-5 space-y-3"><h2 className="font-semibold">{TEMPLATE_LABELS[k]}</h2>
          <div><label className="label" htmlFor={`${k}_subject`}>Subject</label><input id={`${k}_subject`} name={`${k}_subject`} defaultValue={t[k].subject} className="input" /></div>
          <div><label className="label" htmlFor={`${k}_heading`}>Heading</label><input id={`${k}_heading`} name={`${k}_heading`} defaultValue={t[k].heading} className="input" /></div>
          <div><label className="label" htmlFor={`${k}_body`}>Message</label><textarea id={`${k}_body`} name={`${k}_body`} rows={3} defaultValue={t[k].body} className="input" /></div></section>))}
      <button className="btn btn-dark">Save templates</button>
    </form>
  );
}
