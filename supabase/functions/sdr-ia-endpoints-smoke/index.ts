Deno.serve(async () => {
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  const key = Deno.env.get("SDR_IA_API_KEY") ?? "";
  const headers = { "x-api-key": key, "Content-Type": "application/json" };
  const missing = await fetch(`${base}/silva-reagendar`, {
    method: "POST", headers,
    body: JSON.stringify({
      agendamento_id: "00000000-0000-4000-8000-000000000000",
      slot_id: "2026-09-14T10:00:00-03:00|e9f1e36d-10d4-474f-aab6-a25f3094653c",
      motivo: "teste de validação",
      reagendado_por: "João Amorim (IA)",
    }),
  });
  const cancel = await fetch(`${base}/silva-cancelar`, {
    method: "POST", headers,
    body: JSON.stringify({
      agendamento_id: "5acf1124-cb5d-45f4-bc79-4674b86e98af",
      motivo: "lead quer terceirização, fora do modelo",
      cancelado_por: "João Amorim (IA)",
    }),
  });
  return Response.json({
    reagendar_nao_encontrado: { status: missing.status, body: await missing.json() },
    cancelamento_fabio: { status: cancel.status, body: await cancel.json() },
  });
});
