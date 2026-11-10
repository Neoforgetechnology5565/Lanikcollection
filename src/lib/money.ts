export const naira = (kobo: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(kobo / 100);
export const toNairaNumber = (kobo: number) => Math.round(kobo) / 100;
export const toKobo = (naira: number) => Math.round(naira * 100);
