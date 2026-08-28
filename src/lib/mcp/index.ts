import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAppointments from "./tools/list-appointments";
import listClosers from "./tools/list-closers";
import getAppointment from "./tools/get-appointment";
import listSales from "./tools/list-sales";
import salesKpis from "./tools/sales-kpis";
import closerPerformance from "./tools/closer-performance";
import listFollowups from "./tools/list-followups";
import noShowReasons from "./tools/no-show-reasons";
import sdrProductivity from "./tools/sdr-productivity";
import agendaAvailability from "./tools/agenda-availability";
import searchLead from "./tools/search-lead";
import listUsers from "./tools/list-users";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "grupo-silva-agenda-mcp",
  title: "Painel de Agendamentos — Grupo Silva",
  version: "0.2.0",
  instructions:
    "Ferramentas de leitura do painel de agendamentos do Grupo Silva. Reuniões: list_appointments, get_appointment, agenda_availability. Vendas: list_sales, sales_kpis, closer_performance. Follow-ups: list_followups. Qualidade da operação: no_show_reasons, sdr_productivity. Leads: search_lead. Time: list_closers, list_users. Datas sempre em America/Sao_Paulo (YYYY-MM-DD); quando o período é omitido, o padrão é o mês corrente (ou hoje, nas ferramentas de agenda). Todas as chamadas respeitam a permissão do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAppointments,
    getAppointment,
    agendaAvailability,
    listSales,
    salesKpis,
    closerPerformance,
    listFollowups,
    noShowReasons,
    sdrProductivity,
    searchLead,
    listClosers,
    listUsers,
  ],
});
