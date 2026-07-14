
-- Create profiles for any auth.users that don't have one yet (users created before trigger existed)
INSERT INTO public.profiles (id, email, name, avatar_url, onboarding_completed, onboarding_step)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url',
  false,
  1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Also ensure they have org_id and user_roles set up
DO $$
DECLARE
  v_org_id uuid;
  v_user record;
BEGIN
  -- Get or create the default org
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;
  END IF;

  -- Link all orphan profiles to the org
  UPDATE public.profiles SET org_id = v_org_id WHERE org_id IS NULL;

  -- Ensure all users have roles
  FOR v_user IN 
    SELECT p.id FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.org_id = v_org_id
    WHERE ur.user_id IS NULL
  LOOP
    -- Check if any owner exists
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE org_id = v_org_id AND role = 'owner') THEN
      INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user.id, v_org_id, 'owner');
    ELSE
      INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user.id, v_org_id, 'member');
    END IF;
  END LOOP;
END;
$$;
