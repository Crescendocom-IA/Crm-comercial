-- ⚠️ REVISAR ANTES DE RODAR. Não executar sem aprovação e backup.
--
-- Limpeza dos artefatos que os testes E2E deixaram na org real
-- (fcc6ee12 / "Empresa teste", de crescendocomia57@gmail.com).
--
-- Contexto honesto: rodar a suíte de testes contra o projeto de produção poluiu
-- a org do dono real com dados de teste. Este script remove SÓ esses artefatos,
-- identificados por assinaturas de nome inequívocas. Os poucos registros reais
-- (2 deals que não são de teste) NÃO casam com nenhum padrão e ficam intactos.
--
-- Ordem importa por causa das FKs: filhos antes de pais.

-- 1. Tarefas criadas pela automação de teste ("Tarefa auto <timestamp>").
DELETE FROM public.activities
WHERE type = 'task' AND title LIKE 'Tarefa auto %';

-- 2. Deals criados pelos testes de kanban e automação.
--    Padrões: "Deal ganhar <ts>", "E2E Deal <ts>".
DELETE FROM public.activities
WHERE deal_id IN (SELECT id FROM public.deals WHERE title LIKE 'Deal ganhar %' OR title LIKE 'E2E Deal %');
DELETE FROM public.deals
WHERE title LIKE 'Deal ganhar %' OR title LIKE 'E2E Deal %';

-- 3. Contatos importados pelo teste de CSV. Assinatura pelo cargo (title), que é
--    inequívoco. Sem espaço antes do %: uma iteração antiga gravou o title sem
--    marcador ("Diretor, Vendas"), então o padrão precisa casar os dois casos.
DELETE FROM public.contacts
WHERE title LIKE 'Diretor, Vendas%' OR title LIKE 'Gerente, Contas%';

-- 4. Automações de teste ("Auto E2E <timestamp>").
--    Remove logs antes (FK automation_logs -> automations).
DELETE FROM public.automation_logs
WHERE automation_id IN (SELECT id FROM public.automations WHERE name LIKE 'Auto E2E %');
DELETE FROM public.automations
WHERE name LIKE 'Auto E2E %';

-- 5. Remove o vínculo do usuário de teste com a org real. A conta em si
--    (auth.users) é deletada à parte, via admin API (passo separado abaixo),
--    porque não dá para apagar auth.users por SQL comum com segurança.
DELETE FROM public.user_roles
WHERE user_id = '3ee0cd5d-6fa4-4b2f-9075-3b6276e3eea1';
DELETE FROM public.profiles
WHERE id = '3ee0cd5d-6fa4-4b2f-9075-3b6276e3eea1';
