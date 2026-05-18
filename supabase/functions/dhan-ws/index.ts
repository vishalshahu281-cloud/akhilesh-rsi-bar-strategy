// WebSocket proxy to Dhan v2 market feed.
// Client connects to wss://<project>.supabase.co/functions/v1/dhan-ws
// and receives JSON tick messages: { type:"tick", securityId, ltp, ltt }
// Client may send subscription JSON { action:"subscribe"|"unsubscribe",
// instruments:[{ExchangeSegment,SecurityId}], requestCode? }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, upgrade",
};

const NIFTY_DEFAULT = [{ ExchangeSegment: "IDX_I", SecurityId: "13" }];

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({ error: "Expected WebSocket upgrade" }),
      { status: 426, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const TOKEN = Deno.env.get("DHAN_ACCESS_TOKEN");
  const CLIENT = Deno.env.get("DHAN_CLIENT_ID");
  if (!TOKEN || !CLIENT) {
    return new Response("DHAN credentials not configured", { status: 500, headers: corsHeaders });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  const upstreamUrl =
    `wss://api-feed.dhan.co?version=2&token=${encodeURIComponent(TOKEN)}` +
    `&clientId=${encodeURIComponent(CLIENT)}&authType=2`;
  const upstream = new WebSocket(upstreamUrl);
  upstream.binaryType = "arraybuffer";

  const safeSend = (ws: WebSocket, data: string) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };

  upstream.onopen = () => {
    safeSend(client, JSON.stringify({ type: "status", status: "upstream_open" }));
    // Default subscription: NIFTY 50 index ticker (request code 15 = ticker)
    upstream.send(JSON.stringify({
      RequestCode: 15,
      InstrumentCount: NIFTY_DEFAULT.length,
      InstrumentList: NIFTY_DEFAULT,
    }));
  };

  upstream.onmessage = (e) => {
    if (!(e.data instanceof ArrayBuffer)) {
      // Some control responses may be JSON strings
      safeSend(client, JSON.stringify({ type: "raw", data: String(e.data) }));
      return;
    }
    const buf = e.data;
    const dv = new DataView(buf);
    // Dhan v2 packet header (8 bytes):
    //   byte 0: feed response code
    //   bytes 1-2: message length (LE uint16)
    //   byte 3: exchange segment
    //   bytes 4-7: security id (LE int32)
    if (buf.byteLength < 8) return;
    const code = dv.getUint8(0);
    const exchSeg = dv.getUint8(3);
    const securityId = dv.getInt32(4, true);

    // Code 2 = Ticker packet (16 bytes): + float32 LTP + int32 LTT
    if (code === 2 && buf.byteLength >= 16) {
      const ltp = dv.getFloat32(8, true);
      const ltt = dv.getInt32(12, true);
      safeSend(client, JSON.stringify({
        type: "tick", code, exchSeg, securityId, ltp, ltt,
      }));
      return;
    }
    // Code 4 = Quote packet — surface LTP if present
    if (code === 4 && buf.byteLength >= 12) {
      const ltp = dv.getFloat32(8, true);
      safeSend(client, JSON.stringify({
        type: "quote", code, exchSeg, securityId, ltp,
      }));
      return;
    }
    // Code 50 = Server disconnect
    if (code === 50) {
      safeSend(client, JSON.stringify({ type: "disconnect", code }));
      try { upstream.close(); } catch { /* noop */ }
    }
  };

  upstream.onerror = () => {
    safeSend(client, JSON.stringify({ type: "error", source: "upstream" }));
  };
  upstream.onclose = () => {
    safeSend(client, JSON.stringify({ type: "status", status: "upstream_closed" }));
    try { client.close(); } catch { /* noop */ }
  };

  // Forward client subscription messages to Dhan.
  client.onmessage = (e) => {
    try {
      const msg = JSON.parse(String(e.data));
      if (msg?.action === "subscribe" && Array.isArray(msg.instruments)) {
        upstream.send(JSON.stringify({
          RequestCode: msg.requestCode ?? 15,
          InstrumentCount: msg.instruments.length,
          InstrumentList: msg.instruments,
        }));
      } else if (msg?.action === "unsubscribe" && Array.isArray(msg.instruments)) {
        upstream.send(JSON.stringify({
          RequestCode: 16,
          InstrumentCount: msg.instruments.length,
          InstrumentList: msg.instruments,
        }));
      }
    } catch {
      // ignore malformed client messages
    }
  };

  client.onclose = () => { try { upstream.close(); } catch { /* noop */ } };
  client.onerror = () => { try { upstream.close(); } catch { /* noop */ } };

  return response;
});