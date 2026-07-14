-- 1. Recriar função handle_new_user (idempotente, remix-safe)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_user_name text;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Criar profile SEMPRE com onboarding incompleto
  INSERT INTO public.profiles (id, email, name, avatar_url, onboarding_completed, onboarding_step)
  VALUES (
    NEW.id,
    NEW.email,
    v_user_name,
    NEW.raw_user_meta_data->>'avatar_url',
    false,
    1
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-provision organization
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    -- Primeiro usuário: cria a org default e vira owner
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    -- Demais usuários entram como member
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Vincular profile à org
  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id AND org_id IS NULL;

  RETURN NEW;
END;
$function$;

-- 2. Recriar trigger idempotente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill defensivo: usuários sem profile recebem um agora
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
  false,
  1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 4. Backfill: vincular profiles órfãos à org existente e dar role
DO $$
DECLARE
  v_org_id uuid;
  v_profile RECORD;
  v_role app_role;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_profile IN SELECT id FROM public.profiles WHERE org_id IS NULL LOOP
    UPDATE public.profiles SET org_id = v_org_id WHERE id = v_profile.id;

    -- Atribuir role se não existir
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_profile.id AND org_id = v_org_id) THEN
      INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_profile.id, v_org_id, 'member');
    END IF;
  END LOOP;
END $$;