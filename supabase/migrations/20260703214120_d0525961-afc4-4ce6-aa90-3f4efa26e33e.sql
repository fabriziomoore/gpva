
-- 1) Enum e tabela de papéis
CREATE TYPE public.app_role AS ENUM ('leader');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) Função security-definer para verificar papel
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3) Atualizar trigger para NÃO criar equipe quando o novo usuário for líder
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name text;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'is_leader', 'false') = 'true' THEN
    -- Registrar papel de líder e sair sem criar equipe
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'leader'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));
  INSERT INTO public.equipes (id, team_name) VALUES (NEW.id, v_team_name);
  RETURN NEW;
END;
$$;

-- 4) Políticas de LEITURA para líderes em todas as tabelas de dados
CREATE POLICY "Leaders read all equipes" ON public.equipes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders read all expedientes" ON public.expedientes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders read all servicos" ON public.servicos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders read all impactos_expediente" ON public.impactos_expediente
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders read all vinculos_complementos" ON public.vinculos_complementos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));
