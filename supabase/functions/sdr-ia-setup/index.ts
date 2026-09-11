// Setup idempotente do usuário "João Amorim" (SDR IA) + canal "SDR IA".
// Protegido por x-api-key = SDR_IA_API_KEY. Pode ser chamado quantas vezes quiser.
import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL = "joao.amorim.ia@ogruposilva.com.br";
const NAME = "João Amorim";
const CHANNEL_LABEL = "SDR IA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);
  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const steps: Record<string, string> = {};
  try {
    // 1) auth.users
    let userId: string | null = null;
    const { data: prof } = await admin.from("profiles").select("user_id").eq("email", EMAIL).maybeSingle();
    if (prof?.user_id) {
      userId = prof.user_id;
      steps.auth = "existente";
    } else {
      const password = crypto.randomUUID() + crypto.randomUUID(); // descartada: sem login
      const { data: created, error } = await admin.auth.admin.createUser({
        email: EMAIL, password, email_confirm: true, user_metadata: { full_name: NAME },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
          userId = list?.users.find((u) => u.email?.toLowerCase() === EMAIL)?.id ?? null;
          steps.auth = "existente (recuperado)";
        } else throw error;
      } else {
        userId = created.user.id;
        steps.auth = "criado";
      }
    }
    if (!userId) throw new Error("Não foi possível resolver o usuário");

    // 2) profile (handle_new_user pode ter criado; garantimos os campos)
    const { data: existingProfile } = await admin.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (existingProfile) {
      await admin.from("profiles").update({ full_name: NAME, email: EMAIL, active: true, available_for_scheduling: false, must_change_password: false })
        .eq("user_id", userId);
      steps.profile = "atualizado";
    } else {
      const { error } = await admin.from("profiles").insert({
        user_id: userId, full_name: NAME, email: EMAIL, active: true, available_for_scheduling: false, must_change_password: false,
      });
      if (error) throw error;
      steps.profile = "criado";
    }

    // 3) role sdr
    const { data: role } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "sdr").maybeSingle();
    if (!role) {
      const { error } = await admin.from("user_roles").insert({ user_id: userId, role: "sdr" });
      if (error) throw error;
      steps.role = "criada";
    } else steps.role = "existente";

    // 4) booking_channels
    const { data: setting } = await admin.from("app_settings").select("id, value").eq("key", "booking_channels").maybeSingle();
    let list: string[] = [];
    try { list = setting?.value ? JSON.parse(setting.value) : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    if (!list.includes(CHANNEL_LABEL)) {
      const next = JSON.stringify([...(list.length ? list : ["WhatsApp (CRM)", "Ligação API4COM"]), CHANNEL_LABEL]);
      if (setting) await admin.from("app_settings").update({ value: next }).eq("id", setting.id);
      else await admin.from("app_settings").insert({ key: "booking_channels", value: next });
      steps.booking_channel = "adicionado";
    } else steps.booking_channel = "existente";

    await admin.from("audit_logs").insert({
      user_id: userId, user_name: NAME, user_email: EMAIL, action: "sdr_ia_setup",
      entity_type: "user", entity_id: userId, details: steps,
    });

    return json({ ok: true, user_id: userId, email: EMAIL, steps });
  } catch (e) {
    console.error("sdr-ia-setup error", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e), steps }, 500);
  }
});
