CREATE OR REPLACE FUNCTION public.create_procedure_with_version(p_titulo text, p_categoria text, p_descricao text, p_setor text, p_fonte text, p_vigencia_inicio date, p_vigencia_fim date, p_arvore_decisao jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_procedimento_id uuid;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    INSERT INTO public.procedimentos (nome_logico, responsavel_id)
    VALUES (p_titulo, auth.uid())
    RETURNING id INTO v_procedimento_id;

    INSERT INTO public.procedimento_versoes (
        procedimento_id,
        titulo,
        categoria,
        descricao,
        setor,
        fonte,
        versao,
        status,
        arvore_decisao,
        vigencia_inicio,
        vigencia_fim,
        criado_por_id
    ) VALUES (
        v_procedimento_id,
        p_titulo,
        p_categoria,
        p_descricao,
        p_setor,
        p_fonte,
        1,
        'draft',
        p_arvore_decisao,
        p_vigencia_inicio,
        p_vigencia_fim,
        auth.uid()
    );

    RETURN v_procedimento_id;
END;
$function$;