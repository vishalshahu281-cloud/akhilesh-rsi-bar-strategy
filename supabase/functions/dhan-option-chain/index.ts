const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NIFTY 50 index security id on Dhan (IDX_I segment)
const NIFTY_SCRIP_ID = 13;
const UNDERLYING_SEG = "IDX_I";

async function dhanFetch(path: string, body: unknown, token: string, clientId: string) {
  const res = await fetch(`https://api.dhan.co/v2${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": token,
      "client-id": clientId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Dhan ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("DHAN_ACCESS_TOKEN");
    const clientId = Deno.env.get("DHAN_CLIENT_ID");
    if (!token || !clientId) throw new Error("DHAN_ACCESS_TOKEN / DHAN_CLIENT_ID not configured");

    // 1. Get expiry list for NIFTY
    const expiryResp = await dhanFetch("/optionchain/expirylist", {
      UnderlyingScrip: NIFTY_SCRIP_ID,
      UnderlyingSeg: UNDERLYING_SEG,
    }, token, clientId);
    const expiries: string[] = expiryResp?.data ?? [];
    if (expiries.length === 0) throw new Error("No expiries returned");
    const nearestExpiry = expiries[0];

    // 2. Fetch option chain for nearest expiry (rate-limited 1/3s on Dhan)
    const chainResp = await dhanFetch("/optionchain", {
      UnderlyingScrip: NIFTY_SCRIP_ID,
      UnderlyingSeg: UNDERLYING_SEG,
      Expiry: nearestExpiry,
    }, token, clientId);

    const data = chainResp?.data ?? {};
    const underlying: number = data.last_price ?? 0;
    const oc: Record<string, any> = data.oc ?? {};
    const strikes = Object.keys(oc).map((k) => Number(k)).sort((a, b) => a - b);
    const target = Math.round(underlying / 50) * 50;
    const atm = strikes.reduce((b, s) => Math.abs(s - target) < Math.abs(b - target) ? s : b, strikes[0]);
    const row = oc[String(atm.toFixed(6))] ?? oc[String(atm)] ?? oc[Object.keys(oc).find(k => Number(k) === atm) ?? ""];

    return new Response(JSON.stringify({
      success: true,
      underlying,
      expiry: nearestExpiry,
      atmStrike: atm,
      ce: row?.ce ? { ltp: row.ce.last_price, oi: row.ce.oi, volume: row.ce.volume } : null,
      pe: row?.pe ? { ltp: row.pe.last_price, oi: row.pe.oi, volume: row.pe.volume } : null,
      ts: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});