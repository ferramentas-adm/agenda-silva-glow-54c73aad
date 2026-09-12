const corsHeaders = { "Content-Type": "application/json" };

Deno.serve(async () => {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = Deno.env.get("SDR_IA_API_KEY");
  if (!baseUrl || !apiKey) return Response.json({ ok: false }, { status: 500, headers: corsHeaders });

  const proxyUrl = `${baseUrl}/functions/v1/sdr-ia-db`;
  const write = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      path: "sdr_downsell?on_conflict=telefone",
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: { telefone: "11987654321", etapa: "clicou", dados: { smoke: true } },
    }),
  });
  const writeBody = await write.json().catch(() => null);

  const read = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      path: "sdr_downsell?telefone=eq.11987654321&select=telefone,etapa,dados",
      method: "GET",
    }),
  });
  const readBody = await read.json().catch(() => null);

  return Response.json({
    ok: write.ok && read.ok,
    write_status: write.status,
    read_status: read.status,
    write_body: writeBody,
    read_body: readBody,
  }, { status: write.ok && read.ok ? 200 : 500, headers: corsHeaders });
});