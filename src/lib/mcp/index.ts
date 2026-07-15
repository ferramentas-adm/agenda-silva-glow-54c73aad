import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAppointments from "./tools/list-appointments";
import listClosers from "./tools/list-closers";
import getAppointment from "./tools/get-appointment";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "grupo-silva-agenda-mcp",
  title: "Painel de Agendamentos — Grupo Silva",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura do painel de agendamentos (reuniões, closers). Use list_appointments para listar reuniões por período/status, list_closers para o time de closers e get_appointment para detalhes de uma reunião específica. Todas as chamadas respeitam a permissão do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAppointments, listClosers, getAppointment],
});
