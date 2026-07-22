-- Corrige handle_new_user.
--
-- Bug original: o trigger fazia `SELECT id FROM organizations LIMIT 1` e, se
-- existisse QUALQUER organização, inseria o novo usuário como MEMBER dela. Ou
-- seja, o primeiro usuário virava owner de "Minha Empresa" e todos os seguintes
-- caíam como member NA MESMA org — vazamento entre tenants, não só papel errado.
-- Além disso o slug era fixo ('minha-empresa'), que colidiria com o UNIQUE assim
-- que uma segunda org fosse criada.
--
-- Correção:
--   * Convidado (invite-member grava org_id/role no user_metadata): entra na org
--     do convite, com o papel definido. Antes esse metadata era ignorado.
--   * Signup orgânico: cria a PRÓPRIA organização e vira OWNER dela, com slug
--     único derivado do id do usuário.

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
    -- Usuário convidado: entra na org do convite com o papel indicado.
    v_invited_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::app_role, 'member');
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_invited_org, v_invited_role);
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
