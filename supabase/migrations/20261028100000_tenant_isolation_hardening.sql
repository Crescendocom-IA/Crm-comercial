-- Fecha os caminhos pelos quais um usuário entrava em outra organização.
--
-- Pertencimento à org era decidido só por `profiles.org_id`, e havia quatro
-- formas de mexer nele ou de ganhar papel numa org alheia:
--
--   1. "Users can update own profile" não restringe colunas: o usuário fazia
--      UPDATE profiles SET org_id = <org de outra empresa> e passava a ler e
--      escrever tudo dela (user_belongs_to_org olhava só o profile).
--   2. handle_new_user honrava `org_id`/`role` do user_metadata, que o próprio
--      usuário controla no signUp — dava para se cadastrar como OWNER de
--      qualquer org sem convite.
--   3. initialize_org_owner(org, user) é SECURITY DEFINER e executável por
--      qualquer autenticado: virava owner de qualquer org. O app não a usa.
--   4. create_organization_for_user aceitava qualquer p_user_id: tirava outro
--      usuário da org dele.
--
-- Além disso, remover membro (Team) apagava o user_roles mas o UPDATE do
-- profile do removido era barrado pelo RLS em silêncio — o removido continuava
-- com acesso, porque o profile ainda apontava para a org.
--
-- Correção: pertencer passa a exigir profile E papel em user_roles; o cliente
-- não consegue mais atribuir org_id; convite só vale com registro em
-- invitations; as funções privilegiadas checam quem chama.

-- ── 1. Pertencimento = profile.org_id + papel em user_roles ────────────────
-- Uma função cobre as ~110 policies que a usam. Remover o papel em user_roles
-- passa a cortar o acesso na hora.
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id AND r.org_id = p.org_id
    WHERE p.id = _user_id AND p.org_id = _org_id
  )
$$;

-- ── 2. Cliente não atribui org_id ──────────────────────────────────────────
-- Requisições do app rodam como `authenticated`/`anon`. Funções SECURITY
-- DEFINER (handle_new_user, create_organization_for_user, remove_org_member) e
-- as edge functions (service_role) rodam com outro current_user e passam.
-- Sair da org (org_id -> NULL) continua permitido.
CREATE OR REPLACE FUNCTION public.guard_profile_org_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.org_id IS NOT NULL THEN
    RAISE EXCEPTION 'org_id não pode ser definido pelo cliente' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id AND NEW.org_id IS NOT NULL THEN
    RAISE EXCEPTION 'org_id não pode ser alterado pelo cliente' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_org_id ON public.profiles;
CREATE TRIGGER guard_profile_org_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_org_id();

-- Profiles sem org eram visíveis para qualquer usuário de qualquer org (vazava
-- email de quem foi removido). O próprio profile segue visível por id.
DROP POLICY IF EXISTS "Users can view profiles in own org" ON public.profiles;
CREATE POLICY "Users can view profiles in own org" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR user_belongs_to_org(auth.uid(), org_id));

-- ── 3. Convite só vale com registro em invitations ─────────────────────────
-- O metadata continua indicando a org (é o que invite-member grava), mas só é
-- aceito se houver convite pendente para aquele email naquela org; o papel vem
-- do convite, nunca do metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_user_name TEXT;
  v_invited_org UUID;
  v_invited_role app_role;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (NEW.id, NEW.email, v_user_name, NEW.raw_user_meta_data->>'avatar_url');

  v_invited_org := NULLIF(NEW.raw_user_meta_data->>'org_id', '')::uuid;

  IF v_invited_org IS NOT NULL THEN
    SELECT i.role INTO v_invited_role
    FROM public.invitations i
    WHERE i.org_id = v_invited_org
      AND lower(i.email) = lower(NEW.email)
      AND i.accepted_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_invited_org := NULL;  -- metadata sem convite: trata como signup orgânico
    END IF;
  END IF;

  IF v_invited_org IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_invited_org, COALESCE(v_invited_role, 'member'));
    v_org_id := v_invited_org;
  ELSE
    -- Signup orgânico: própria organização, como owner. Slug único por usuário.
    INSERT INTO public.organizations (name, slug, settings)
    VALUES (
      'Minha Empresa',
      'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12),
      '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb
    )
    RETURNING id INTO v_org_id;
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'owner');
  END IF;

  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- ── 4. Funções privilegiadas checam quem chama ─────────────────────────────
-- Só o próprio usuário, e só se ainda não tiver org (é o caso que o
-- CompanyStep cobre; com org, ele faz UPDATE em organizations).
CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  p_user_id UUID, p_name TEXT, p_slug TEXT, p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'só é possível criar organização para si mesmo' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND org_id IS NOT NULL) THEN
    RAISE EXCEPTION 'usuário já pertence a uma organização' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organizations (name, slug, settings)
  VALUES (p_name, p_slug, p_settings)
  RETURNING id INTO v_org_id;
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, v_org_id, 'owner');
  UPDATE public.profiles SET org_id = v_org_id WHERE id = p_user_id;
  RETURN v_org_id;
END;
$$;

-- Não é usada pelo app; executável por qualquer autenticado, dava owner de
-- qualquer org. Fica só para uso administrativo (service_role / SQL editor).
REVOKE EXECUTE ON FUNCTION public.initialize_org_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 5. Remover membro de verdade ───────────────────────────────────────────
-- O app apagava o papel e tentava zerar o profile do removido, mas o RLS de
-- profiles só deixa cada um editar o próprio — o UPDATE não fazia nada.
-- (A policy "Owners can delete roles" também barrava o admin, embora a tela
-- Equipe mostre o botão para ele.) Owner e admin removem; owner só por owner.
CREATE OR REPLACE FUNCTION public.remove_org_member(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM public.profiles WHERE id = auth.uid();
  IF v_org_id IS NULL OR NOT (
    public.has_role(auth.uid(), v_org_id, 'owner') OR public.has_role(auth.uid(), v_org_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'apenas owner ou admin podem remover membros' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'não é possível remover a si mesmo' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(p_user_id, v_org_id, 'owner') AND NOT public.has_role(auth.uid(), v_org_id, 'owner') THEN
    RAISE EXCEPTION 'apenas o owner pode remover outro owner' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND org_id = v_org_id;
  UPDATE public.profiles SET org_id = NULL WHERE id = p_user_id AND org_id = v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_org_member(UUID) TO authenticated;
