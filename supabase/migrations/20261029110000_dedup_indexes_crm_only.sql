-- Unicidade de CNPJ (empresas) e e-mail (contatos) só para registros do CRM.
--
-- Os índices de 20260727100000_import_dedup_indexes existem para a importação
-- de CSV não duplicar cadastro. Mas o ERP tem 560 documentos repetidos em
-- 1.222 clientes (ex.: a SANEPAR com 14 cadastros, um por unidade, cada um com
-- os próprios pedidos). Para o ERP a chave é codigo_erp (já único por org);
-- juntar ou descartar esses cadastros deixaria os pedidos deles sem cliente.
--
-- Os registros que vêm do ERP (codigo_erp preenchido) saem da regra; os
-- criados no app ou por planilha continuam protegidos contra duplicata.

DROP INDEX IF EXISTS public.companies_cnpj_org_idx;
CREATE UNIQUE INDEX companies_cnpj_org_idx
  ON public.companies (org_id, cnpj_cpf)
  WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf <> '' AND codigo_erp IS NULL;

DROP INDEX IF EXISTS public.contacts_email_org_idx;
CREATE UNIQUE INDEX contacts_email_org_idx
  ON public.contacts (org_id, lower(email))
  WHERE email IS NOT NULL AND email <> '' AND codigo_erp IS NULL;
