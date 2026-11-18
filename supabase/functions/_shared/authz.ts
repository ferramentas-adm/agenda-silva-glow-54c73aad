// Helpers de autorização para edge functions (service-role).
// "privilegiado" = gestão, SDR ou apresentador: pode agir sobre qualquer closer.
// Closer puro só pode agir sobre o próprio cadastro (closers.email = e-mail do usuário).
// deno-lint-ignore-file no-explicit-any

export interface Caller {
  userId: string;
  email: string | null;
  roles: string[];
  closerId: string | null;
  isManager: boolean;
  isPrivileged: boolean;
}

export async function loadCaller(admin: any, userId: string, email: string | null): Promise<Caller> {
  const [{ data: roleRows }, closerRes] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId),
    email
      ? admin.from("closers").select("id").eq("email", email).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const roles = (roleRows ?? []).map((r: any) => String(r.role));
  const isManager = roles.some((r) => ["gestor", "moderador", "supervisor"].includes(r));
  const isPrivileged = isManager || roles.some((r) => ["sdr", "apresentador"].includes(r));
  return { userId, email, roles, closerId: closerRes?.data?.id ?? null, isManager, isPrivileged };
}

export function canActOnCloser(c: Caller, closerId: string | null | undefined): boolean {
  if (!closerId) return false;
  return c.isPrivileged || (c.closerId !== null && c.closerId === closerId);
}

export async function canAccessAgendamento(admin: any, c: Caller, agendamentoId: string): Promise<boolean> {
  const { data } = await admin
    .from("agendamentos")
    .select("id, closer_id, created_by, sdr_responsavel_id")
    .eq("id", agendamentoId)
    .maybeSingle();
  if (!data) return false;
  if (c.isPrivileged) return true;
  return (c.closerId !== null && data.closer_id === c.closerId) ||
    data.created_by === c.userId || data.sdr_responsavel_id === c.userId;
}

/** Valida o segredo interno usado por triggers/cron (header x-cron-secret). */
export async function hasValidCronSecret(admin: any, req: Request): Promise<boolean> {
  const got = (req.headers.get("x-cron-secret") ?? "").trim();
  if (!got) return false;
  const { data } = await admin.from("app_settings").select("value").eq("key", "crm_daily_cron_token").maybeSingle();
  const expected = (data?.value ?? "").trim();
  return expected.length > 0 && got === expected;
}

// ─── state assinado para OAuth ────────────────────────────
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signState(secret: string, closerId: string, ttlSec = 900): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = `${closerId}.${exp}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyState(secret: string, state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [closerId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = await hmac(secret, `${closerId}.${expStr}`);
  return expected === sig ? closerId : null;
}
