import { getSettings } from "@/lib/settings";
import { availableMethods } from "@/lib/payments";
import { CheckoutForm } from "./CheckoutForm";
export const metadata = { title: "Checkout" };
export default async function Checkout() {
  const [methods, s] = await Promise.all([availableMethods(), getSettings()]);
  return <div className="mx-auto max-w-5xl px-4 pt-12"><p className="eyebrow">Secure checkout</p><h1 className="section-title mt-2">Checkout</h1>
    <CheckoutForm methods={methods} shippingKobo={s.shippingFlatKobo} /></div>;
}
