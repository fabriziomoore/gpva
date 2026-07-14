
ALTER TABLE public.active_sessions
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- Admin pode listar todas as sessões ativas
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.active_sessions;
CREATE POLICY "Admins can view all sessions"
  ON public.active_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin pode deslogar (deletar) qualquer sessão
DROP POLICY IF EXISTS "Admins can delete any session" ON public.active_sessions;
CREATE POLICY "Admins can delete any session"
  ON public.active_sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
