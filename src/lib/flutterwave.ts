// Thin Flutterwave v3 client. Server-side only: secret keys never reach the browser.
import "server-only";

export type FlwMode = "sandbox" | "live";

export function flwConfig() {
  const mode = (process.env.FLW_MODE ?? "sandbox") as FlwMode;
  const secret = process.env.FLW_SECRET_KEY ?? "";
  const isTestKey = secret.startsWith("FLWSECK_TEST");
  if (mode !== "sandbox" && mode !== "live") throw new Error("FLW_MODE must be 'sandbox' or 'live'");
  if (!secret) throw new Error("FLW_SECRET_KEY is not configured");
  // Guard against sending real money flows through test keys (or the reverse).
  if (mode === "live" && isTestKey) throw new Error("FLW_MODE=live but FLW_SECRET_KEY is a test key");
  if (mode === "sandbox" && !isTestKey && !process.env.FLW_BASE_URL) {
    throw new Error("FLW_MODE=sandbox but FLW_SECRET_KEY is not a test key");
  }
  // A custom base URL (local mock) is a sandbox-only testing aid.
  if (mode === "live" && process.env.FLW_BASE_URL) throw new Error("FLW_BASE_URL is not allowed in live mode");
  return {
    mode,
    secret,
    secretHash: process.env.FLW_SECRET_HASH ?? "",
    base: process.env.FLW_BASE_URL ?? "https://api.flutterwave.com/v3",
  };
}

export function flwConfigured() {
  try { flwConfig(); return true; } catch { return false; }
}

export class FlwError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) { super(message); }
}

async function flw<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { secret, base } = flwConfig();
  const res = await fetch(base + path, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || body?.status === "error") {
    throw new FlwError(body?.message ?? `Flutterwave request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export type Customer = { email: string; name: string; phone: string };

/** Hosted checkout link restricted to the given payment_options (e.g. "card", "ussd", "opay", "nqr", "account"). */
export async function createHostedPayment(p: {
  txRef: string; amountNaira: number; options: string[]; redirectUrl: string; customer: Customer; title?: string;
}) {
  const r = await flw<{ data: { link: string } }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: p.txRef,
      amount: p.amountNaira,
      currency: "NGN",
      redirect_url: p.redirectUrl,
      payment_options: p.options.join(","),
      customer: { email: p.customer.email, name: p.customer.name, phonenumber: p.customer.phone },
      customizations: { title: p.title ?? "LANIK COLLECTIONS" },
    }),
  });
  if (!r.data?.link) throw new FlwError("Flutterwave did not return a checkout link");
  return r.data.link;
}

/**
 * Provider expiry -> Date, but only when it can be trusted. Accepts ISO-8601 WITH a timezone (Z or +hh:mm).
 * Strings without a timezone (e.g. "2026-01-31 10:46:53 AM") are ambiguous (UTC vs Nigerian time), so they are ignored
 * and the expiry configured in Admin applies instead. Also rejects times in the past or more than 6 hours away.
 */
export function parseProviderExpiry(v: unknown, now = Date.now()): Date | null {
  if (typeof v !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(v.trim())) return null;
  const d = new Date(v.trim()); const t = d.getTime();
  return Number.isFinite(t) && t > now - 5 * 60_000 && t < now + 6 * 3600_000 ? d : null;
}
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] != null && o[k] !== "") return String(o[k]); return null; };

/** Dynamic, single-use virtual account for one order. */
export async function createVirtualAccount(p: {
  txRef: string; amountNaira: number; customer: Customer; narration: string;
}) {
  const r = await flw<any>("/charges?type=bank_transfer", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: p.txRef,
      amount: p.amountNaira,
      currency: "NGN",
      email: p.customer.email,
      fullname: p.customer.name,
      phone_number: p.customer.phone,
      is_permanent: false,
      narration: p.narration,
    }),
  });
  // Flutterwave has used slightly different field names across API versions; accept the known variants.
  const a = r?.meta?.authorization ?? r?.data?.meta?.authorization ?? r?.data ?? {};
  const account = pick(a, "transfer_account", "account_number", "accountNumber");
  const bank = pick(a, "transfer_bank", "bank_name", "bankName", "bank");
  if (!account || !bank) throw new FlwError("Flutterwave did not return virtual account details", undefined, r);
  return {
    bank, accountNumber: account,
    accountName: pick(a, "transfer_account_name", "account_name", "accountName"),
    note: pick(a, "transfer_note", "note"),
    amountNaira: a.transfer_amount != null ? Number(a.transfer_amount) : p.amountNaira,
    expiresAt: parseProviderExpiry(a.account_expiration ?? a.expires_at ?? a.expiry_date),
    rawExpiry: pick(a, "account_expiration", "expires_at", "expiry_date"),
    raw: r,
  };
}

export type VerifiedTx = {
  id: number | string; txRef: string; status: string; amount: number; chargedAmount: number;
  currency: string; paymentType?: string; raw: unknown;
};

/** Authoritative server-to-server verification. Never trust webhook bodies or redirect query strings. */
export async function verifyByReference(txRef: string): Promise<VerifiedTx | null> {
  try {
    const r = await flw<any>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    const d = r?.data;
    if (!d) return null;
    return {
      id: d.id, txRef: d.tx_ref, status: String(d.status ?? "").toLowerCase(),
      amount: Number(d.amount), chargedAmount: Number(d.charged_amount ?? d.amount),
      currency: d.currency, paymentType: d.payment_type, raw: r,
    };
  } catch (e) {
    // "No transaction was found" simply means the customer has not paid yet.
    if (e instanceof FlwError && (e.status === 404 || /no transaction/i.test(e.message))) return null;
    throw e;
  }
}

/** Ask Flutterwave to refund (part of) a successful transaction. Refunds are asynchronous: status may be "pending". */
export async function refundTransaction(providerTxId: string, amountNaira: number) {
  const r = await flw<any>(`/transactions/${encodeURIComponent(providerTxId)}/refund`, { method: "POST", body: JSON.stringify({ amount: amountNaira }) });
  const d = r?.data ?? {};
  return { ref: d.id != null ? String(d.id) : null, status: String(d.status ?? "pending").toLowerCase(), raw: r };
}

/** For the admin diagnostics page only: returns status + body without throwing. */
export async function flwRaw(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const { secret, base } = flwConfig();
  const res = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const text = await res.text(); let body: unknown = text; try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body };
}
