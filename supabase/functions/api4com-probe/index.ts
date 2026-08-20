const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

Deno.serve(async () => {
  const res = await fetch(`${BASE}/calls`, {
    headers: { Authorization: TOKEN, Accept: "application/json" },
  });
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
  return new Response(JSON.stringify(list.slice(0, 5), null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
