const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

const TARGETS: Array<{ path: string; method: string; body?: unknown }> = [
  { path: "/dialer", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/dialer/call", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/dialer/dial", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/dialer/click2call", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/dialer/originate", method: "POST", body: { from: "9999", to: "000" } },
  { path: "/dialers", method: "GET" },
  { path: "/dialer/x", method: "GET" },
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
      out.push({ ...t, status: res.status, response: (await res.text()).slice(0, 500) });
    } catch (e) {
      out.push({ ...t, error: String(e) });
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
