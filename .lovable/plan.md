Remover o botão "Reagendar para outro dia" do diálogo de detalhes do agendamento em `src/pages/DashboardPage.tsx`, para qualquer role.

Motivo: o sistema agora marca reagendamento automaticamente quando o SDR cria uma nova agenda do mesmo lead em até 7 dias. Manter o botão duplica o fluxo e gera inconsistência.

Mantém: "Editar horário" (ajustes pequenos no mesmo dia), "Transferir lead para outro closer", Cancelar, No-show, Confirmar, Realizada.

Não inclui mudanças de backend nem de outras telas.