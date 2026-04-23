-- ============================================================
-- 1. ROLE_PERMISSIONS — matriz dinâmica de permissões por função
-- ============================================================
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read role permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Gestors can manage role permissions"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial baseado nos defaults atuais do código
INSERT INTO public.role_permissions (role, permission_key, allowed) VALUES
  -- view_calendar
  ('gestor',    'view_calendar', true),
  ('moderador', 'view_calendar', true),
  ('closer',    'view_calendar', true),
  ('sdr',       'view_calendar', true),
  -- view_meetings
  ('gestor',    'view_meetings', true),
  ('moderador', 'view_meetings', true),
  ('closer',    'view_meetings', true),
  ('sdr',       'view_meetings', true),
  -- view_follow_ups
  ('gestor',    'view_follow_ups', true),
  ('moderador', 'view_follow_ups', true),
  ('closer',    'view_follow_ups', true),
  ('sdr',       'view_follow_ups', false),
  -- manage_tasks
  ('gestor',    'manage_tasks', true),
  ('moderador', 'manage_tasks', true),
  ('closer',    'manage_tasks', true),
  ('sdr',       'manage_tasks', false),
  -- view_dashboard_comercial
  ('gestor',    'view_dashboard_comercial', true),
  ('moderador', 'view_dashboard_comercial', true),
  ('closer',    'view_dashboard_comercial', false),
  ('sdr',       'view_dashboard_comercial', false),
  -- manage_payments
  ('gestor',    'manage_payments', true),
  ('moderador', 'manage_payments', true),
  ('closer',    'manage_payments', false),
  ('sdr',       'manage_payments', false),
  -- view_payments
  ('gestor',    'view_payments', true),
  ('moderador', 'view_payments', true),
  ('closer',    'view_payments', true),
  ('sdr',       'view_payments', false),
  -- view_admin
  ('gestor',    'view_admin', true),
  ('moderador', 'view_admin', true),
  ('closer',    'view_admin', false),
  ('sdr',       'view_admin', false),
  -- view_audit_logs
  ('gestor',    'view_audit_logs', true),
  ('moderador', 'view_audit_logs', true),
  ('closer',    'view_audit_logs', false),
  ('sdr',       'view_audit_logs', false),
  -- create_appointment
  ('gestor',    'create_appointment', true),
  ('moderador', 'create_appointment', true),
  ('closer',    'create_appointment', true),
  ('sdr',       'create_appointment', true);

-- ============================================================
-- 2. TASKS — tarefas avulsas em Follow-ups
-- ============================================================
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_date date,
  due_time text,
  status text NOT NULL DEFAULT 'pendente',
  assigned_closer_id uuid REFERENCES public.closers(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assigned_closer ON public.tasks(assigned_closer_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: closer vê só as próprias; gestor/moderador veem tudo
CREATE POLICY "Tasks select by role"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
    OR (
      has_role(auth.uid(), 'closer'::app_role)
      AND assigned_closer_id IN (
        SELECT c.id FROM public.closers c WHERE c.email = auth.email()
      )
    )
  );

-- INSERT: gestor/moderador/closer
CREATE POLICY "Tasks insert by role"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      has_role(auth.uid(), 'gestor'::app_role)
      OR has_role(auth.uid(), 'moderador'::app_role)
      OR (
        has_role(auth.uid(), 'closer'::app_role)
        AND (
          assigned_closer_id IS NULL
          OR assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
        )
      )
    )
  );

-- UPDATE: gestor/moderador tudo; closer só as suas
CREATE POLICY "Tasks update by role"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
    OR (
      has_role(auth.uid(), 'closer'::app_role)
      AND assigned_closer_id IN (
        SELECT c.id FROM public.closers c WHERE c.email = auth.email()
      )
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
    OR (
      has_role(auth.uid(), 'closer'::app_role)
      AND assigned_closer_id IN (
        SELECT c.id FROM public.closers c WHERE c.email = auth.email()
      )
    )
  );

-- DELETE: gestor/moderador tudo; closer só as suas
CREATE POLICY "Tasks delete by role"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
    OR (
      has_role(auth.uid(), 'closer'::app_role)
      AND assigned_closer_id IN (
        SELECT c.id FROM public.closers c WHERE c.email = auth.email()
      )
    )
  );

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. PAGAMENTOS — controle de recebíveis
-- ============================================================
CREATE TABLE public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome text NOT NULL,
  cliente_telefone text,
  valor_previsto numeric(12,2) NOT NULL DEFAULT 0,
  valor_realizado numeric(12,2),
  valor_apresentado numeric(12,2),
  data_prevista date NOT NULL,
  data_pagamento date,
  status text NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  metodo text,
  observacoes text,
  closer_id uuid REFERENCES public.closers(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  venda_id uuid REFERENCES public.vendas(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagamentos_closer ON public.pagamentos(closer_id);
CREATE INDEX idx_pagamentos_data_prevista ON public.pagamentos(data_prevista);
CREATE INDEX idx_pagamentos_status ON public.pagamentos(status);
CREATE INDEX idx_pagamentos_venda ON public.pagamentos(venda_id);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- SELECT: todos autenticados (necessário para painel/dashboard)
CREATE POLICY "Authenticated can view pagamentos"
  ON public.pagamentos FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: closer pode lançar para si mesmo; gestor/moderador qualquer um
CREATE POLICY "Allowed users can insert pagamentos"
  ON public.pagamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      has_role(auth.uid(), 'gestor'::app_role)
      OR has_role(auth.uid(), 'moderador'::app_role)
      OR (
        has_role(auth.uid(), 'closer'::app_role)
        AND (
          closer_id IS NULL
          OR closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
        )
      )
    )
  );

-- UPDATE: apenas gestor/moderador (controle financeiro)
CREATE POLICY "Managers can update pagamentos"
  ON public.pagamentos FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
  );

-- DELETE: apenas gestor/moderador
CREATE POLICY "Managers can delete pagamentos"
  ON public.pagamentos FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
  );

CREATE TRIGGER trg_pagamentos_updated_at
  BEFORE UPDATE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();