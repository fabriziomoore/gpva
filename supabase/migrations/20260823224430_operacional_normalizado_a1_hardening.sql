-- CORREÇÃO CIRÚRGICA PÓS-A1 — HARDENING DA ÁRVORE OPERACIONAL

-- 1. HARDEN SECURITY DEFINER FUNCTIONS
-- Reforçando search_path para segurança contra ataques de search_path overriding
ALTER FUNCTION public.check_lider_estrutura_integrity()
SET search_path = public, pg_temp;

ALTER FUNCTION public.check_equipe_hierarquia_integrity()
SET search_path = public, pg_temp;

-- 2. UPDATED_AT DEDICADO
-- Substituindo helper genérico handle_updated_at por um dedicado à estrutura operacional
CREATE OR REPLACE FUNCTION public.touch_operacional_estrutura_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Reapontar triggers existentes
DROP TRIGGER IF EXISTS set_updated_at ON public.supervisores;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supervisores
FOR EACH ROW EXECUTE FUNCTION public.touch_operacional_estrutura_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.lideres_estrutura;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lideres_estrutura
FOR EACH ROW EXECUTE FUNCTION public.touch_operacional_estrutura_updated_at();

-- Remover função legada e genérica da A1
-- Somente se não houver dependências (A1 a criou apenas para estas duas tabelas)
DROP FUNCTION public.handle_updated_at();
