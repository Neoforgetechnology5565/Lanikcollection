import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { METHODS, METHOD_LABELS, type Method } from "./methods";
export { METHODS, METHOD_LABELS };
export type { Method };

export type Settings = {
  enabledMethods: Record<Method, boolean>;
  transferExpiryMinutes: number;   // admin-configurable 60..180
  onlineWindowMinutes: number;     // window for hosted checkout channels
  bank: { bankName: string; accountName: string; accountNumber: string; instructions: string };
  shippingFlatKobo: number;
  whatsapp: string;
  businessName: string;
};

export const DEFAULTS: Settings = {
  enabledMethods: { card: true, bank_transfer: true, ussd: true, opay: true, qr: true, internet_banking: true, manual_transfer: false },
  transferExpiryMinutes: 120,
  onlineWindowMinutes: 60,
  bank: { bankName: "", accountName: "", accountNumber: "", instructions: "Use your order number as the payment narration." },
  shippingFlatKobo: 250000,
  whatsapp: "",
  businessName: "LANIK COLLECTIONS",
};

export const clampExpiry = (m: number) => Math.min(180, Math.max(60, Math.round(Number.isFinite(m) ? m : 120)));

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "app"));
  const v = (row?.value ?? {}) as Partial<Settings>;
  return {
    ...DEFAULTS, ...v,
    enabledMethods: { ...DEFAULTS.enabledMethods, ...(v.enabledMethods ?? {}) },
    bank: { ...DEFAULTS.bank, ...(v.bank ?? {}) },
    transferExpiryMinutes: clampExpiry(v.transferExpiryMinutes ?? DEFAULTS.transferExpiryMinutes),
  };
}

export async function saveSettings(s: Settings) {
  await db.insert(schema.settings).values({ key: "app", value: s })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: s } });
}
