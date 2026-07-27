-- Dedupe da importação de CSV: chaves idempotentes por org.
--
-- A dedupe funcional acontece no app (CSVImportModal casa por chave e faz
-- update em vez de insert). Estes índices são o backstop no banco: garantem
-- que dois inserts concorrentes com a mesma chave não escapem.
--
-- Espelham os índices de codigo_erp da fase 1 do ERP: PARCIAIS (só linhas com a
-- chave preenchida disputam unicidade) e POR ORG (a mesma chave pode existir em
-- organizações diferentes sem colidir).
--
-- ATENÇÃO na aplicação: se a tabela já tiver duplicatas — dois contatos na
-- mesma org com o mesmo email (case-insensitive), ou duas empresas com o mesmo
-- cnpj_cpf — o CREATE UNIQUE INDEX falha. Limpe os duplicados antes (a query de
-- diagnóstico abaixo os lista) ou rode este arquivo após a limpeza.
--
--   -- contatos com email repetido por org:
--   -- select org_id, lower(email), count(*) from contacts
--   --   where email is not null and email <> '' group by 1,2 having count(*) > 1;
--   -- empresas com cnpj_cpf repetido por org:
--   -- select org_id, cnpj_cpf, count(*) from companies
--   --   where cnpj_cpf is not null and cnpj_cpf <> '' group by 1,2 having count(*) > 1;

-- Contato: email é a chave primária de dedupe. lower() para casar "A@x" com
-- "a@x" — a mesma normalização que o app usa. codigo_erp já tem índice (fase 1).
create unique index if not exists contacts_email_org_idx
  on contacts (org_id, lower(email))
  where email is not null and email <> '';

-- Empresa: CNPJ/CPF quando presente. Sem CNPJ, o app casa por nome normalizado
-- (não imposto no banco: nome não é chave natural e colidiria com homônimos
-- legítimos — a dedupe por nome fica só no app, onde é uma escolha, não uma trava).
create unique index if not exists companies_cnpj_org_idx
  on companies (org_id, cnpj_cpf)
  where cnpj_cpf is not null and cnpj_cpf <> '';
