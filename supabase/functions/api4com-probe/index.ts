const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const variant = url.searchParams.get("v") ?? "1";
  const bodies: Record<string, Record<string, unknown>> = {
    "1": { from: "1000", to: "11999998888" },
    "2": { from: "1000@ogruposilva.api4com.com", to: "11999998888" },
    "3": { from: "1000", to: "11999998888", domain: "ogruposilva.api4com.com" },
    "4": { extension: "1000", to: "11999998888" },
    "5": { from: "213179", to: "11999998888" },
  };
  const body = bodies[variant];
  const res = await fetch(`${BASE}/dialer`, {
    method: "POST",
    headers: { Authorization: TOKEN, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = (await res.text()).slice(0, 500);
  return new Response(JSON.stringify({ body, status: res.status, response: text }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
