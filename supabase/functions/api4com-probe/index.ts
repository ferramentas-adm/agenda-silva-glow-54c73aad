const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

const BODIES: Record<string, unknown>[] = [
  {},
  { from: "9999", to: "000" },
  { ramal: "9999", numero: "000" },
  { extension: "9999", destination: "000" },
  { from: "9999", to: "000", call_type: "outbound" },
];

Deno.serve(async () => {
  const out: unknown[] = [];
  for (const body of BODIES) {
    try {
      const res = await fetch(`${BASE}/calls`, {
        method: "POST",
        headers: { Authorization: TOKEN, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      out.push({ body, status: res.status, response: (await res.text()).slice(0, 600) });
    } catch (e) {
      out.push({ body, error: String(e) });
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
