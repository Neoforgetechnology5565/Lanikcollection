import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { decryptSecret, otpauthUrl } from "@/lib/totp";
import { startTwoFactor } from "./actions";
import { ConfirmForm, DisableForm, PasswordForm, RegenForm } from "./Forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const me = await requireAdmin();
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, me.id));
  const pending = !a.totpEnabled && a.totpSecretEnc ? decryptSecret(a.totpSecretEnc) : null;
  const qr = pending ? await QRCode.toDataURL(otpauthUrl(pending, a.email), { margin: 1, width: 220 }) : null;
  return (
    <div className="space-y-8 max-w-3xl">
      <div><h1 className="font-serif text-3xl font-bold">My account</h1><p className="text-sm text-ink/60">{a.email}</p></div>
      <section className="card p-6 space-y-3"><h2 className="font-semibold">Change password</h2><PasswordForm /></section>

      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-3"><h2 className="font-semibold">Two-step login</h2>
          <span className={`text-xs font-bold px-2 py-0.5 ${a.totpEnabled ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{a.totpEnabled ? "ON" : "OFF"}</span></div>
        {a.totpEnabled ? (
          <div className="space-y-6">
            <p className="text-sm text-ink/70">Signing in needs your password and a 6-digit code from your authenticator app. {a.recoveryHashes.length} recovery code{a.recoveryHashes.length === 1 ? "" : "s"} left.</p>
            <div className="grid sm:grid-cols-2 gap-8"><div><h3 className="text-sm font-semibold mb-2">Get new recovery codes</h3><RegenForm /></div><div><h3 className="text-sm font-semibold mb-2">Turn it off</h3><DisableForm /></div></div>
          </div>
        ) : pending ? (
          <div className="space-y-4">
            <ol className="text-sm list-decimal pl-5 space-y-1 text-ink/80"><li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li><li>Scan this QR code, or type the key by hand.</li><li>Enter the 6-digit code it shows.</li></ol>
            <div className="flex flex-wrap gap-6 items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="border border-champagne" />}
              <div><p className="label">Key (if you can't scan)</p><p className="font-mono text-sm break-all max-w-xs select-all">{pending}</p></div>
            </div>
            <ConfirmForm />
          </div>
        ) : (
          <form action={startTwoFactor} className="space-y-3"><p className="text-sm text-ink/70">Adds a second step so a stolen password alone can't open your admin. Takes about a minute.</p><button className="btn btn-gold">Set up two-step login</button></form>
        )}
      </section>
    </div>
  );
}
