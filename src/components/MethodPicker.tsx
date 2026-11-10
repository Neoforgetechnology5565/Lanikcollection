"use client";
import { METHOD_LABELS, type Method } from "@/lib/methods";
export function MethodPicker({ methods, value, onChange }: { methods: Method[]; value: Method | ""; onChange: (m: Method) => void }) {
  if (!methods.length) return <p className="text-red-700 text-sm">No payment methods are available right now. Please contact us on WhatsApp.</p>;
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Payment method">
      {methods.map((m) => (
        <label key={m} className={`flex items-center gap-3 border p-3 cursor-pointer ${value === m ? "border-gold bg-champagne/40" : "border-champagne bg-white"}`}>
          <input type="radio" name="method" checked={value === m} onChange={() => onChange(m)} className="accent-[#D99A24]" />
          <span className="text-sm font-medium">{METHOD_LABELS[m]}</span>
        </label>
      ))}
    </div>
  );
}
