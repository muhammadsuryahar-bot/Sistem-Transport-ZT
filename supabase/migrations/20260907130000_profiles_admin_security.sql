-- Profile access control for the Transport application.
-- Users may read only their own profile; ADMIN may read all profiles.
-- Role/status changes are ADMIN-only and cannot target the current ADMIN account.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_any_role(array['ADMIN'::public.user_role])
);

DROP POLICY IF EXISTS profiles_update_admin_other_users ON public.profiles;
CREATE POLICY profiles_update_admin_other_users
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id <> auth.uid()
  AND public.has_any_role(array['ADMIN'::public.user_role])
)
WITH CHECK (
  id <> auth.uid()
  AND public.has_any_role(array['ADMIN'::public.user_role])
);
