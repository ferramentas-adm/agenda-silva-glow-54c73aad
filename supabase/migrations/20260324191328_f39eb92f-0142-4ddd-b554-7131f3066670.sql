
-- 1. Add soft-delete columns to agendamentos
ALTER TABLE public.agendamentos 
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text DEFAULT NULL;

-- 2. Allow authenticated users to delete agendamentos (soft delete via update)
CREATE POLICY "Authenticated can soft-delete agendamentos" 
ON public.agendamentos 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 3. Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only gestors can view audit logs
CREATE POLICY "Gestors can view audit logs" 
ON public.audit_logs 
FOR SELECT 
TO authenticated 
USING (public.has_role(auth.uid(), 'gestor'));

-- Authenticated users can insert audit logs
CREATE POLICY "Authenticated can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);
