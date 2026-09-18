// Lista oficial de motivos de não comparecimento / cancelamento.
// Fonte: app_settings.no_show_reasons (editável em Admin > Listas).
// O motivo gravado em agendamentos.cancellation_reason só aceita estes valores;
// qualquer texto livre vai para agendamentos.cancellation_note (justificativa).

export const DEFAULT_NO_SHOW_REASONS = [
  "No-show",
  "Cancelou por imprevisto pessoal",
  "Cancelou por desistência",
  "Não acompanhado pelo SDR",
  "Sem closer disponível",
  "Alterou horário para o mesmo dia",
];

export const normalizeReasonKey = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Busca a lista oficial no banco, com fallback para a lista padrão. */
export async function loadOfficialReasons(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "no_show_reasons")
      .maybeSingle();
    const raw = data?.value;
    // `value` é guardado como string JSON (ver useAppSettingList).
    let list: unknown[] | null = null;
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch { /* mantém fallback */ }
    }
    const clean = (list ?? [])
      .map((v: unknown) => String(v ?? "").trim())
      .filter((v: string) => v.length > 0);
    return clean.length ? clean : DEFAULT_NO_SHOW_REASONS;
  } catch {
    return DEFAULT_NO_SHOW_REASONS;
  }
}

/** Retorna o motivo oficial (grafia da lista) ou null quando não casa. */
export function matchOfficialReason(
  raw: string | null | undefined,
  officialReasons: readonly string[],
): string | null {
  const key = normalizeReasonKey(raw);
  if (!key) return null;
  return officialReasons.find((r) => normalizeReasonKey(r) === key) ?? null;
}
