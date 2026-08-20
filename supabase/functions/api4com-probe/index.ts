const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";

const PATHS = [
  "https://api.api4com.com/extensions",
  "https://api.api4com.com/v1/extensions",
  "https://api.api4com.com/api/v1/extensions",
  "https://api.api4com.com/api/extensions",
  "https://api.api4com.com/",
  "https://api.api4com.com/v1",
  "https://api.api4com.com/calls",
  "https://api.api4com.com/v1/calls",
  "https://app.api4com.com/api/v1/extensions",
];

Deno.serve(async () => {
  const out: unknown[] = [];
  for (const url of PATHS) {
    for (const scheme of ["Bearer", "Token", "raw"]) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: scheme === "raw" ? TOKEN : `${scheme} ${TOKEN}`,
            Accept: "application/json",
          },
        });
        const text = (await res.text()).slice(0, 300);
        out.push({ url, scheme, status: res.status, body: text });
      } catch (e) {
        out.push({ url, scheme, error: String(e) });
      }
    }
  }
  return new Response(JSON.stringify({ token_len: TOKEN.length, out }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
