-- ============================================================
-- Support Tickets — Domain Config Schema
-- Run in Supabase SQL Editor after schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_domain_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program     TEXT NOT NULL,
  domain      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ticket_domain_config_program_unique UNIQUE (program)
);

DROP TRIGGER IF EXISTS ticket_domain_config_set_updated_at ON public.ticket_domain_config;
CREATE TRIGGER ticket_domain_config_set_updated_at
  BEFORE UPDATE ON public.ticket_domain_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ticket_domain_config ENABLE ROW LEVEL SECURITY;

-- Only admins (via user_roles) can manage domain config
DROP POLICY IF EXISTS "Admins manage domain config" ON public.ticket_domain_config;
CREATE POLICY "Admins manage domain config"
  ON public.ticket_domain_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
