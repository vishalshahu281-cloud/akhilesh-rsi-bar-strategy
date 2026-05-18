const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("DHAN_ACCESS_TOKEN");
    const clientId = Deno.env.get("DHAN_CLIENT_ID");
    if (!token || !clientId) throw new Error("DHAN credentials not configured");

    const res = await fetch("https://api.dhan.co/v2/holdings", {
      method: "GET",
      headers: {
        "access-token": token,
        "client-id": clientId,
        "Content-Type": "application/json",
      },
    });

    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, status: res.status, error: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, holdings: data, ts: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});