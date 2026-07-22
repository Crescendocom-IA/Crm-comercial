-- ⚠️ REVISAR ANTES DE RODAR. Não executar sem aprovação e backup.
--
-- Migração de dados legados para o bug do handle_new_user (achado-3).
--
-- Alvo: usuários que o trigger antigo auto-anexou como MEMBER da primeira org
-- global, sem convite legítimo. Para cada um: cria a própria organização e o
-- torna owner dela, repontando o profile.
--
-- NÃO move dados de negócio (deals, contatos, etc). Num tenant compartilhado
-- por engano não há como atribuir com segurança cada registro ao usuário certo
-- — os dados ficam na org original, do dono legítimo. Esta migração só corrige
-- a alocação de PESSOAS, não a de dados.
--
-- Idempotente: só age sobre members-sem-convite; rodar de novo não duplica.

DO $$
DECLARE
  r RECORD;
  v_new_org UUID;
BEGIN
  FOR r IN
    -- Vítimas do bug: role=member numa org, SEM linha de convite correspondente.
    SELECT ur.user_id, p.email, p.name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'member'
      AND NOT EXISTS (
        SELECT 1 FROM public.invitations i
        WHERE i.email = p.email AND i.org_id = ur.org_id
      )
  LOOP
    -- 1. Cria uma organização nova, própria do usuário. Slug único pelo id.
    INSERT INTO public.organizations (name, slug, settings)
    VALUES (
      'Minha Empresa',
      'org-' || substr(replace(r.user_id::text, '-', ''), 1, 12),
      '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb
    )
    RETURNING id INTO v_new_org;

    -- 2. Remove o vínculo errado (member da org alheia).
    DELETE FROM public.user_roles WHERE user_id = r.user_id AND role = 'member';

    -- 3. Torna o usuário owner da própria org.
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (r.user_id, v_new_org, 'owner');

    -- 4. Reaponta o profile para a org nova (some da org alheia).
    UPDATE public.profiles SET org_id = v_new_org WHERE id = r.user_id;

    RAISE NOTICE 'Migrado % (%): nova org %', r.email, r.user_id, v_new_org;
  END LOOP;
END $$;
