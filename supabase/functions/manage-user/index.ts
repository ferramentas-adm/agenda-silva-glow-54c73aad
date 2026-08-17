import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = caller.id;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["gestor", "moderador"]);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerIsGestor = roles.some((r) => r.role === "gestor");
    const callerIsModeradorOnly = !callerIsGestor;

    const body = await req.json();
    const { user_id, action } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Moderador não pode mexer em Gestores
    if (callerIsModeradorOnly) {
      const { data: targetRoleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .maybeSingle();
      if (targetRoleRow?.role === "gestor") {
        return new Response(JSON.stringify({ error: "Moderadores não podem alterar usuários Administradores." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Tampouco promover alguém a Gestor
      if (action === "change_role" && body.new_role === "gestor") {
        return new Response(JSON.stringify({ error: "Moderadores não podem promover a Administrador." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Delete user
    if (action === "delete") {
      console.log(`[delete] Deleting user ${user_id}, cleaning up dependent records...`);
      
      // Get profile to find associated closer
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("user_id", user_id)
        .single();

      // Clean up closer-related records if user has an email match
      if (profile?.email) {
        const { data: closer } = await supabaseAdmin
          .from("closers")
          .select("id")
          .eq("email", profile.email)
          .maybeSingle();
        
        if (closer) {
          console.log(`[delete] Found closer ${closer.id}, cleaning closer data...`);
          await supabaseAdmin.from("closer_blocks").delete().eq("closer_id", closer.id);
          await supabaseAdmin.from("closer_google_tokens").delete().eq("closer_id", closer.id);
          // closer_id on agendamentos will be SET NULL automatically by FK cascade
          await supabaseAdmin.from("closers").delete().eq("id", closer.id);
        }
      }

      // Clean up user records
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);

      console.log(`[delete] Deleting auth user ${user_id}...`);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) {
        console.error(`[delete] Auth delete error:`, error);
        throw error;
      }
      console.log(`[delete] User ${user_id} deleted successfully`);
      return new Response(JSON.stringify({ message: "Usuário excluído" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Toggle active
    if (action === "toggle_active") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("active")
        .eq("user_id", user_id)
        .single();

      const newActive = !(profile?.active ?? true);
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ active: newActive })
        .eq("user_id", user_id);

      if (error) throw error;

      if (!newActive) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
      } else {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ message: newActive ? "Usuário ativado" : "Usuário desativado", active: newActive }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Change password
    if (action === "change_password") {
      const { new_password } = body;
      if (!new_password || new_password.length < 8) {
        return new Response(JSON.stringify({ error: "Senha deve ter no mínimo 8 caracteres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[change_password] Updating password for user_id: ${user_id}`);

      // Verify user exists in auth first
      const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (getUserError || !authUser?.user) {
        console.error(`[change_password] User not found in auth: ${user_id}`, getUserError);
        return new Response(JSON.stringify({ error: "Usuário não encontrado no sistema de autenticação. Pode ter sido excluído." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password });
      if (updateError) {
        console.error(`[change_password] Failed to update password for ${user_id}:`, updateError);
        throw updateError;
      }

      console.log(`[change_password] Password updated successfully for ${user_id}`);

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("user_id", user_id);

      if (profileError) {
        console.error(`[change_password] Failed to set must_change_password for ${user_id}:`, profileError);
      }

      return new Response(JSON.stringify({ message: "Senha alterada com sucesso" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Change role
    if (action === "change_role") {
      const { new_role } = body;
      if (!["sdr", "gestor", "closer", "moderador", "supervisor", "apresentador"].includes(new_role)) {
        return new Response(JSON.stringify({ error: "Role inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current role
      const { data: currentRoleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .single();

      const oldRole = currentRoleData?.role;

      // Update role in user_roles table
      const { error } = await supabaseAdmin
        .from("user_roles")
        .update({ role: new_role })
        .eq("user_id", user_id);

      if (error) throw error;

      // Gestor é função de gestão: nunca aparece em rankings/métricas de SDR.
      if (new_role === "gestor") {
        await supabaseAdmin
          .from("profiles")
          .update({ is_sdr_override: false })
          .eq("user_id", user_id);
      }

      // Get user profile for email/name
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", user_id)
        .single();

      // If changing TO closer, create closer record if not exists, or reactivate if it exists but inactive
      if (new_role === "closer" && profile?.email) {
        const { data: existing } = await supabaseAdmin
          .from("closers")
          .select("id, active, name")
          .eq("email", profile.email)
          .maybeSingle();

        if (!existing) {
          await supabaseAdmin.from("closers").insert({
            name: profile.full_name || profile.email,
            email: profile.email,
            active: true,
          });
        } else if (!existing.active) {
          await supabaseAdmin
            .from("closers")
            .update({ active: true, name: profile.full_name || existing.name })
            .eq("id", existing.id);
        }
      }

      // If changing to a non-closer role, deactivate the closer record unless the
      // user is explicitly marked as available for scheduling.
      if (new_role !== "closer" && profile?.email) {
        const { data: profileFlags } = await supabaseAdmin
          .from("profiles")
          .select("available_for_scheduling")
          .eq("user_id", user_id)
          .maybeSingle();

        if (!profileFlags?.available_for_scheduling) {
          await supabaseAdmin
            .from("closers")
            .update({ active: false })
            .eq("email", profile.email);
        }
      }


      return new Response(JSON.stringify({ message: `Role alterada para ${new_role}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Toggle scheduling availability for non-closer users
    if (action === "toggle_scheduling") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("available_for_scheduling, email, full_name")
        .eq("user_id", user_id)
        .single();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newValue = !profile.available_for_scheduling;

      // Update the flag
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ available_for_scheduling: newValue })
        .eq("user_id", user_id);
      if (updateError) throw updateError;

      if (newValue && profile.email) {
        // Create closer record if not exists
        const { data: existing } = await supabaseAdmin
          .from("closers")
          .select("id, active")
          .eq("email", profile.email)
          .maybeSingle();

        if (existing) {
          if (!existing.active) {
            await supabaseAdmin.from("closers").update({ active: true }).eq("id", existing.id);
          }
        } else {
          await supabaseAdmin.from("closers").insert({
            name: profile.full_name || profile.email,
            email: profile.email,
          });
        }
      } else if (!newValue && profile.email) {
        // Check if user is actually a closer by role — if not, deactivate the closer record
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user_id)
          .single();

        if (roleData?.role !== "closer") {
          await supabaseAdmin
            .from("closers")
            .update({ active: false })
            .eq("email", profile.email);
        }
      }

      return new Response(JSON.stringify({ message: newValue ? "Usuário disponível para agendamento" : "Usuário removido do agendamento", available: newValue }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
