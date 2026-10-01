-- Renomeia o motivo de inviabilidade "Imóvel não localizado" para
-- "Endereço não localizado" (nome correto, usado também no aviso de
-- desdobro de CADASTRAL). Troca em todo lugar onde o nome aparece:
-- catálogo, serviços já registrados (reason_name é uma cópia do nome) e o
-- texto dos relatórios já gerados.
update public.motivos_inviabilidade
  set name = 'Endereço não localizado'
  where name = 'Imóvel não localizado';

update public.servicos
  set reason_name = 'Endereço não localizado'
  where reason_name = 'Imóvel não localizado';

update public.expedientes
  set report_text = replace(report_text, 'Imóvel não localizado', 'Endereço não localizado')
  where report_text like '%Imóvel não localizado%';
