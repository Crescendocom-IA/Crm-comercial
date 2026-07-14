
-- Reset onboarding data from previous remix
DELETE FROM public.pipeline_stages WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.pipelines WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.integration_configs WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.org_secrets WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.onboarding_progress WHERE org_id IN (SELECT id FROM public.organizations);
UPDATE public.profiles SET onboarding_completed = false, onboarding_step = 1;
UPDATE public.organizations SET name = 'Minha Empresa', settings = '{}';

-- Recreate the trigger that was lost in remix
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
