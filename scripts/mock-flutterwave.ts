// LOCAL TESTING ONLY. A tiny stand-in for the Flutterwave v3 API so the payment flow can be exercised
// without sandbox keys. flwConfig() refuses FLW_BASE_URL in live mode, so this can never be used in production.
import http from "node:http";

type Tx = { tx_ref: string; amount: number; status: "pending" | "successful" | "failed" | null; id: number };
export function startMockFlutterwave(port = 4010) {
  const txs = new Map<string, Tx>();
  const state = { down: false, vaMinutes: 180, nextId: 1000, noChannels: new Set<string>() };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const body = await new Promise<any>((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
    const send = (code: number, o: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

    if (url.pathname === "/__pay") { // test control: simulate the customer paying (or failing)
      const t = txs.get(body.tx_ref) ?? { tx_ref: body.tx_ref, amount: body.amount, status: null, id: state.nextId++ };
      t.status = body.status ?? "successful"; t.amount = body.amount ?? t.amount; txs.set(t.tx_ref, t); return send(200, {});
    }
    if (url.pathname === "/__config") { Object.assign(state, body); if (body.noChannels) state.noChannels = new Set(body.noChannels); return send(200, {}); }
    if (state.down) return send(503, { status: "error", message: "Service unavailable" });
    if (!req.headers.authorization?.startsWith("Bearer ")) return send(401, { status: "error", message: "No Authorization" });

    if (url.pathname === "/v3/charges" && url.searchParams.get("type") === "bank_transfer") {
      txs.set(body.tx_ref, { tx_ref: body.tx_ref, amount: body.amount, status: null, id: state.nextId++ });
      return send(200, { status: "success", message: "Charge initiated", meta: { authorization: {
        transfer_reference: "MOCK" + body.tx_ref, transfer_account: "9" + String(state.nextId).padStart(9, "0"), transfer_bank: "Mock Wema Bank",
        transfer_amount: body.amount, transfer_note: "Please make a bank transfer to Lanik Collections",
        account_expiration: new Date(Date.now() + state.vaMinutes * 60_000).toISOString(), mode: "banktransfer" } } });
    }
    if (url.pathname === "/v3/payments") {
      const ch = String(body.payment_options);
      if (state.noChannels.has(ch)) return send(400, { status: "error", message: `Payment option ${ch} is not enabled on this account` });
      return send(200, { status: "success", data: { link: `https://checkout.mock/pay/${body.tx_ref}?o=${ch}` } });
    }
    if (url.pathname === "/v3/transactions/verify_by_reference") {
      const t = txs.get(url.searchParams.get("tx_ref")!);
      if (!t || !t.status) return send(404, { status: "error", message: "No transaction was found for this id" });
      return send(200, { status: "success", data: { id: t.id, tx_ref: t.tx_ref, status: t.status, amount: t.amount, charged_amount: t.amount, currency: "NGN", payment_type: "bank_transfer" } });
    }
    send(404, { status: "error", message: "not found" });
  });
  return new Promise<{ server: http.Server; url: string; ctl: (p: string, b: unknown) => Promise<void> }>((resolve) =>
    server.listen(port, () => resolve({ server, url: `http://localhost:${port}`, ctl: async (p, b) => { await fetch(`http://localhost:${port}${p}`, { method: "POST", body: JSON.stringify(b) }); } })));
}
if (process.argv[1]?.endsWith("mock-flutterwave.ts")) startMockFlutterwave().then((m) => console.log("mock flutterwave on", m.url));
