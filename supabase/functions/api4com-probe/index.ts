const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";
const BASE = "https://api.api4com.com/api/v1";

const PATHS = [
  "/click2call",
  "/clicktocall",
  "/calls",
  "/call",
  "/originate",
  "/cdr",
  "/cdrs",
  "/extensions",
  "/dial",
];

Deno.serve(async () => {
  const out: unknown[] = [];
  for (const p of PATHS) {
    for (const method of ["GET", "POST"]) {
      try {
        const res = await fetch(`${BASE}${p}`, {
          method,
          headers: { Authorization: TOKEN, Accept: "application/json", "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({}) : undefined,
        });
        const text = (await res.text()).slice(0, 400);
        out.push({ path: p, method, status: res.status, body: text });
      } catch (e) {
        out.push({ path: p, method, error: String(e) });
      }
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
