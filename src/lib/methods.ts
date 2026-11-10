export const METHODS = ["card", "bank_transfer", "ussd", "opay", "qr", "internet_banking", "manual_transfer"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABELS: Record<Method, string> = {
  card: "Debit / Credit Card (Visa, Mastercard, Verve)",
  bank_transfer: "Bank Transfer (instant account for this order)",
  ussd: "USSD",
  opay: "OPay",
  qr: "QR Payment",
  internet_banking: "Internet Banking",
  manual_transfer: "Manual Transfer (upload receipt)",
};
