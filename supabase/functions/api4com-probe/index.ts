const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

const BODIES: Record<string, unknown>[] = [
  { from: "1000", to: "11999998888" },
  { from: "1000@ogruposilva.api4com.com", to: "11999998888" },
  { from: 1000, to: "11999998888" },
  { from: "1000", to: "11999998888", domain: "ogruposilva.api4com.com" },
  { extension: "1000", to: "11999998888" },
  { extension_id: 213179, to: "11999998888" },
  { from: "213179", to: "11999998888" },
];

Deno.serve(async () => {
  const out: unknown[] = [];
  for (const body of BODIES) {
    const res = await fetch(`${BASE}/dialer`, {
      method: "POST",
      headers: { Authorization: TOKEN, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    out.push({ body, status: res.status, response: (await res.text()).slice(0, 400) });
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
