
CREATE OR REPLACE FUNCTION public.mark_invitation_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public' AS $$
BEGIN
  UPDATE public.invitations
  SET accepted_at = now()
  WHERE email = NEW.email
    AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_mark_invite
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_invitation_accepted();
