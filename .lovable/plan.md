# Voltar a permitir que o SDR confirme a reunião

## O que está acontecendo (verificado no banco)

O status antigo **"Reagendada"** continua sendo criado automaticamente, mesmo depois de removermos o reagendamento do fluxo.

Existe uma regra no banco (gatilho de detecção de reagendamento) que, ao criar uma nova reunião para um lead que já tinha reunião viva (Agendada/Confirmada) nos últimos 7 dias, muda a reunião antiga para **Reagendada** e vincula as duas.

Hoje existem 18 reuniões com status "Reagendada" e 3 com "Pendente" de ontem para frente — inclusive uma marcada hoje às 11:46 (BRT).

E na tela de Calendário, em "Detalhes do agendamento":
- o botão **Confirmar** está escondido quando o status é "Reagendada";
- pior: para SDR, quando o status é "Reagendada" toda a área "Alterar status" é substituída pela mensagem "contate um gestor ou moderador". Ou seja, o SDR fica sem nenhum botão nessa reunião.

Resultado: sempre que o SDR agenda de novo o mesmo lead (o cenário mais comum agora, já que todo remanejo virou "nova reunião"), a reunião antiga — ou a que ele está tentando confirmar — cai em "Reagendada" e o botão Confirmar desaparece.

## O que será feito

1. Encerrar de vez o status "Reagendada" na criação de reuniões: a regra do banco deixa de mudar o status da reunião anterior. O vínculo entre reuniões (para histórico) continua sendo registrado.
2. Normalizar os registros presos: reuniões de hoje para frente, não excluídas, com status "Reagendada" ou "Pendente", voltam para **Agendada** (aguardando confirmação), para que os SDRs possam confirmá-las hoje mesmo.
3. Na tela de detalhes do agendamento:
   - remover o bloqueio de SDR baseado em "Reagendada" (mensagem "contate um gestor");
   - o botão **Confirmar** volta a aparecer para SDR/Gestor/Moderador/Supervisor sempre que a reunião ainda não tem desfecho, ou seja, em Agendada, Não confirmada e Pendente;
   - Confirmar continua escondido para Closer e para reuniões já Confirmadas, Realizadas, Não compareceu/Canceladas.
4. Manter a regra de responsabilidade que já existia: o SDR confirma as reuniões em que ele é o responsável ou o criador; gestor, supervisor e moderador confirmam qualquer uma.

## Detalhes técnicos

- Migração: `CREATE OR REPLACE FUNCTION public.detect_and_mark_reschedule()` sem os dois `UPDATE ... SET status = 'reagendada'` (mantém apenas `NEW.original_agendamento_id`); mais um `UPDATE public.agendamentos SET status = 'agendada' WHERE deleted_at IS NULL AND scheduled_date >= CURRENT_DATE AND status IN ('reagendada','pendente')`.
- `src/pages/DashboardPage.tsx`: remover `sdrBlocked` / `sdrIsOwnerOfReschedule` e o bloco de mensagem; trocar a condição do botão Confirmar por uma lista explícita de status confirmáveis (`agendada`, `nao_confirmada`, `pendente`) com `role !== "closer"`.
- Nada muda em RLS (`is_manager_or_sdr()` já autoriza o SDR a atualizar) nem no payload do CRM: "Confirmar" continua enviando o status pelo gatilho existente.
