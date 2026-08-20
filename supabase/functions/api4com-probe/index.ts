const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

const TARGETS: Array<{ path: string; method: string; body?: unknown }> = [
  { path: "", method: "GET" },
  { path: "/", method: "GET" },
  { path: "/calls", method: "OPTIONS" },
  { path: "/calls/originate", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/extensions/213179/call", method: "POST", body: { to: "000" } },
  { path: "/extensions/213179/click2call", method: "POST", body: { to: "000" } },
  { path: "/extensions/213179", method: "GET" },
  { path: "/webphone", method: "GET" },
  { path: "/dialer", method: "GET" },
  { path: "/queues", method: "GET" },
  { path: "/swagger.json", method: "GET" },
  { path: "/openapi.json", method: "GET" },
  { path: "/explorer", method: "GET" },
];

Deno.serve(async () => {
  const out: unknown[] = [];
  for (const t of TARGETS) {
    try {
      const res = await fetch(`${BASE}${t.path}`, {
        method: t.method,
        headers: { Authorization: TOKEN, Accept: "application/json", "Content-Type": "application/json" },
        body: t.body ? JSON.stringify(t.body) : undefined,
      });
      out.push({
        ...t,
        status: res.status,
        allow: res.headers.get("allow"),
        response: (await res.text()).slice(0, 400),
      });
    } catch (e) {
      out.push({ ...t, error: String(e) });
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
