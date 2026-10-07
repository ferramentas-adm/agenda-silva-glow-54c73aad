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
      const { data: targetRoleRows } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);
      const targetRoles = (targetRoleRows ?? []).map((r: { role: string }) => r.role);
      if (targetRoles.includes("gestor")) {
        return new Response(JSON.stringify({ error: "Moderadores não podem alterar usuários Administradores." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Ativar/inativar: proibido em contas de Moderador e na própria conta
      if (action === "toggle_active") {
        if (user_id === callerId) {
          return new Response(JSON.stringify({ error: "Você não pode alterar o status da sua própria conta." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (targetRoles.includes("moderador")) {
          return new Response(JSON.stringify({ error: "Moderadores não podem ativar/inativar outros Moderadores." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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

      // Trava: quem tem histórico (reuniões ou vendas) só pode ser inativado.
      let histCloserId: string | null = null;
      if (profile?.email) {
        const { data: c } = await supabaseAdmin.from("closers").select("id").ilike("email", profile.email).maybeSingle();
        histCloserId = c?.id ?? null;
      }
      const orFilter = [`sdr_responsavel_id.eq.${user_id}`, `created_by.eq.${user_id}`, ...(histCloserId ? [`closer_id.eq.${histCloserId}`] : [])].join(",");
      const { count: agCount } = await supabaseAdmin.from("agendamentos").select("id", { count: "exact", head: true }).or(orFilter);
      const { count: vCount } = await supabaseAdmin.from("vendas").select("id", { count: "exact", head: true }).eq("created_by", user_id);
      if ((agCount ?? 0) > 0 || (vCount ?? 0) > 0) {
        return new Response(JSON.stringify({
          error: `Este colaborador tem ${agCount ?? 0} reuniões e ${vCount ?? 0} vendas no histórico. Para não perder esses dados nos relatórios, ele não pode ser excluído: desligue a chave para inativar o acesso.`,
          has_history: true,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

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

    // Toggle active — estado desejado explícito e idempotente.
    if (action === "toggle_active") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("active, email, available_for_scheduling")
        .eq("user_id", user_id)
        .single();

      // Compatibilidade: sem `active` no corpo, inverte o valor atual.
      const newActive = typeof body.active === "boolean" ? body.active : !(profile?.active ?? true);

      // Chamada duplicada/atrasada não pode reverter o status.
      if ((profile?.active ?? true) === newActive) {
        return new Response(JSON.stringify({ message: "Status já estava atualizado", active: newActive, noop: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: updated, error } = await supabaseAdmin
        .from("profiles")
        .update({ active: newActive })
        .eq("user_id", user_id)
        .eq("active", !newActive)
        .select("user_id");

      if (error) throw error;

      if (!updated || updated.length === 0) {
        return new Response(JSON.stringify({ message: "Status já estava atualizado", active: newActive, noop: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      if (!newActive) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
        // Usuário inativado: desativa o registro de closer. A trigger no banco
        // devolve as reuniões futuras dele para "Aguardando atribuição".
        if (profile?.email) {
          await supabaseAdmin
            .from("closers")
            .update({ active: false })
            .eq("email", profile.email)
            .eq("active", true);
        }
      } else {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        // Reativa o registro de closer apenas se a função for closer ou o
        // usuário estiver marcado como disponível para agendamento.
        if (profile?.email) {
          const { data: roleData } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", user_id)
            .maybeSingle();

          if (roleData?.role === "closer" || profile.available_for_scheduling) {
            await supabaseAdmin
              .from("closers")
              .update({ active: true })
              .eq("email", profile.email)
              .eq("active", false);
          }
        }
      }

      return new Response(JSON.stringify({ message: newActive ? "Usuário ativado" : "Usuário desativado", active: newActive }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Edição global de usuário: propaga nome/e-mail para auth, profiles e closers
    if (action === "update_user") {
      const rawName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

      if (!rawName) {
        return new Response(JSON.stringify({ error: "Nome é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return new Response(JSON.stringify({ error: "E-mail inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: authTarget, error: authTargetError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (authTargetError || !authTarget?.user) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado na autenticação" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profileBefore } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", user_id)
        .maybeSingle();

      const oldAuthEmail = (authTarget.user.email ?? "").toLowerCase();
      const oldProfileEmail = (profileBefore?.email ?? "").toLowerCase();

      // E-mail já usado por outro usuário?
      const { data: emailOwner } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .ilike("email", rawEmail)
        .neq("user_id", user_id)
        .maybeSingle();
      if (emailOwner) {
        return new Response(JSON.stringify({ error: "Este e-mail já está em uso por outro usuário." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Conta de autenticação (e-mail de login + metadados)
      if (oldAuthEmail !== rawEmail || authTarget.user.user_metadata?.full_name !== rawName) {
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          email: rawEmail,
          email_confirm: true,
          user_metadata: { ...(authTarget.user.user_metadata ?? {}), full_name: rawName },
        });
        if (authUpdateError) {
          const msg = /already been registered|already exists/i.test(authUpdateError.message ?? "")
            ? "Este e-mail já está cadastrado em outra conta de acesso."
            : authUpdateError.message;
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const revertAuth = async () => {
        if (oldAuthEmail && oldAuthEmail !== rawEmail) {
          await supabaseAdmin.auth.admin.updateUserById(user_id, {
            email: oldAuthEmail,
            email_confirm: true,
          });
        }
      };

      // 2) Perfil
      const { error: profileUpdateError } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: rawName, email: rawEmail })
        .eq("user_id", user_id);
      if (profileUpdateError) {
        await revertAuth();
        return new Response(JSON.stringify({ error: `Falha ao atualizar perfil: ${profileUpdateError.message}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3) Cadastro de closer vinculado (por e-mail antigo, do auth ou do perfil)
      const candidateEmails = [oldProfileEmail, oldAuthEmail, rawEmail].filter(Boolean);
      let closerUpdated = false;
      for (const candidate of candidateEmails) {
        const { data: closer } = await supabaseAdmin
          .from("closers")
          .select("id")
          .ilike("email", candidate)
          .maybeSingle();
        if (closer) {
          const { error: closerError } = await supabaseAdmin
            .from("closers")
            .update({ name: rawName, email: rawEmail })
            .eq("id", closer.id);
          if (closerError) {
            await revertAuth();
            await supabaseAdmin
              .from("profiles")
              .update({ full_name: profileBefore?.full_name ?? rawName, email: oldProfileEmail || rawEmail })
              .eq("user_id", user_id);
            return new Response(JSON.stringify({ error: `Falha ao atualizar cadastro de closer: ${closerError.message}` }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          closerUpdated = true;
          break;
        }
      }

      // Auditoria
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", callerId)
        .maybeSingle();

      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerId,
        user_name: callerProfile?.full_name ?? "Sistema",
        user_email: callerProfile?.email ?? null,
        action: "update_user",
        entity_type: "user",
        entity_id: user_id,
        details: {
          old_name: profileBefore?.full_name ?? null,
          new_name: rawName,
          old_profile_email: oldProfileEmail || null,
          old_auth_email: oldAuthEmail || null,
          new_email: rawEmail,
          closer_updated: closerUpdated,
        },
      });

      return new Response(
        JSON.stringify({ message: "Usuário atualizado em todo o sistema", email: rawEmail, closer_updated: closerUpdated }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
