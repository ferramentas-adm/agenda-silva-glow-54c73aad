-- Garante que novos agendamentos NUNCA entrem como 'confirmada' diretamente.
-- Status 'confirmada' só pode ser definido depois, via UPDATE (webhook do WhatsApp ou ação manual).
-- Isso protege contra clients antigos em cache que ainda enviem 'confirmada' no INSERT.

CREATE OR REPLACE FUNCTION public.enforce_initial_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Em INSERT, se vier 'confirmada', converte para 'agendada'.
  -- Status válidos no INSERT: 'agendada' (novo) ou 'reagendada' (reagendamento).
  IF NEW.status = 'confirmada' THEN
    NEW.status := 'agendada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_initial_status ON public.agendamentos;

CREATE TRIGGER trg_enforce_initial_status
BEFORE INSERT ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_initial_agendamento_status();