import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateRandomPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  // 12 values for character selection + 11 for Fisher-Yates shuffle
  const rand = crypto.getRandomValues(new Uint32Array(23));
  let ri = 0;
  const pick = (charset: string) => charset[rand[ri++] % charset.length];

  // Ensure at least 1 upper, 1 lower, 1 digit, 1 special
  const pw = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(special),
    ...Array.from({ length: 8 }, () => pick(all)),
  ];

  // Fisher-Yates shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const j = rand[ri++] % (i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }

  return pw.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await supabaseClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["gestor", "moderador"]);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Acesso negado. Apenas gestores e moderadores podem criar usuários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, role } = await req.json();

    if (!email || !full_name || !role) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: email, full_name, role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["sdr", "gestor", "closer", "moderador", "supervisor", "apresentador"].includes(role)) {
      return new Response(JSON.stringify({ error: "Role inválida. Use 'sdr', 'gestor', 'closer', 'moderador', 'supervisor' ou 'apresentador'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Moderador não pode criar Gestor
    const callerIsGestor = roles.some((r: { role: string }) => r.role === "gestor");
    if (!callerIsGestor && role === "gestor") {
      return new Response(JSON.stringify({ error: "Moderadores não podem criar usuários Administradores." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate random password
    const generatedPassword = generateRandomPassword();

    // Create auth user
    let { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    let recovered = false;

    if (createError) {
      const alreadyExists = createError.message?.includes("already been registered")
        || createError.message?.toLowerCase().includes("already exists");

      if (alreadyExists) {
        // The auth account may exist without a profile (orphan from a failed delete).
        // In that case we re-adopt it instead of blocking the re-registration.
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users?.find(
          (u: { id: string; email?: string }) => (u.email ?? "").toLowerCase() === String(email).toLowerCase(),
        );

        if (existing) {
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("user_id", existing.id)
            .maybeSingle();

          if (existingProfile) {
            return new Response(JSON.stringify({ error: "Este e-mail já está cadastrado no sistema." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Orphan account: restore access and rebuild profile/role.
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: generatedPassword,
            email_confirm: true,
            ban_duration: "none",
            user_metadata: { full_name },
          });
          if (updErr) {
            return new Response(JSON.stringify({ error: updErr.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          await supabaseAdmin.from("profiles").upsert(
            { user_id: existing.id, full_name, email, active: true, must_change_password: true },
            { onConflict: "user_id" },
          );

          newUser = { user: existing } as typeof newUser;
          createError = null;
          recovered = true;
        }
      }

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Assign role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser!.user.id);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser!.user.id, role });

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set must_change_password = true on profile
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, active: true })
      .eq("user_id", newUser!.user.id);

    // If closer, also create entry in closers table linked by email
    if (role === "closer") {
      const { data: existingCloser } = await supabaseAdmin
        .from("closers")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (existingCloser) {
        await supabaseAdmin.from("closers").update({ active: true, name: full_name }).eq("id", existingCloser.id);
      } else {
        await supabaseAdmin.from("closers").insert({ name: full_name, email });
      }
    }


    return new Response(
      JSON.stringify({
        message: recovered
          ? "Conta existente sem cadastro foi recuperada e reativada com nova senha temporária."
          : "Usuário criado com sucesso",
        user_id: newUser!.user.id,
        generated_password: generatedPassword,
        recovered,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
