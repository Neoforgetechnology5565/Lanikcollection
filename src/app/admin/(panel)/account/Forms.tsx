"use client";
import { useActionState } from "react";
import { changePassword, confirmTwoFactor, disableTwoFactor, regenerateCodes, type State } from "./actions";

function Msg({ s }: { s: State }) {
  if (!s) return null;
  return (
    <div role={s.error ? "alert" : "status"} className={`p-3 text-sm border ${s.error ? "bg-red-50 border-red-300 text-red-900" : "bg-green-50 border-green-300 text-green-900"}`}>
      {s.error ?? s.message}
      {s.codes && <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-base tracking-wider select-all">{s.codes.map((c) => <li key={c}>{c}</li>)}</ul>}
      {s.codes && <p className="mt-2 text-xs">Each code works once if you lose your phone. Store them somewhere safe (a password manager).</p>}
    </div>
  );
}
export function PasswordForm() {
  const [s, act, pending] = useActionState(changePassword, null);
  return (
    <form action={act} className="space-y-3 max-w-md">
      <Msg s={s} />
      <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" required autoComplete="current-password" className="input" /></div>
      <div><label className="label" htmlFor="next">New password (10+ characters)</label><input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
      <div><label className="label" htmlFor="again">Repeat new password</label><input id="again" name="again" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
      <button className="btn btn-dark" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
export function ConfirmForm() {
  const [s, act, pending] = useActionState(confirmTwoFactor, null);
  return (
    <form action={act} className="space-y-3 max-w-xs">
      <Msg s={s} />
      {s?.ok && <p className="text-xs text-ink/60">When you've saved the codes, reload this page.</p>}
      {!s?.ok && <><div><label className="label" htmlFor="code">6-digit code from the app</label><input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" className="input tracking-widest text-lg" /></div>
        <button className="btn btn-gold" disabled={pending}>{pending ? "Checking…" : "Turn on two-step login"}</button></>}
    </form>
  );
}
export function RegenForm() {
  const [s, act, pending] = useActionState(regenerateCodes, null);
  return (
    <form action={act} className="space-y-3 max-w-xs"><Msg s={s} />
      <div><label className="label" htmlFor="rcode">Current 6-digit code</label><input id="rcode" name="code" required inputMode="numeric" className="input" /></div>
      <button className="btn btn-line" disabled={pending}>New recovery codes</button></form>
  );
}
export function DisableForm() {
  const [s, act, pending] = useActionState(disableTwoFactor, null);
  return (
    <form action={act} className="space-y-3 max-w-xs"><Msg s={s} />
      <div><label className="label" htmlFor="dpw">Your password</label><input id="dpw" name="password" type="password" required className="input" /></div>
      <div><label className="label" htmlFor="dcode">Current 6-digit code</label><input id="dcode" name="code" required inputMode="numeric" className="input" /></div>
      <button className="btn btn-line" disabled={pending}>Turn off two-step login</button></form>
  );
}
