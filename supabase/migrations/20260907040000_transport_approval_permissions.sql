-- Approval records are append-only for normal approvers.
-- ADMIN retains correction authority; ATASAN_TRANSPORT / DIREKTUR only insert approvals.

DROP POLICY IF EXISTS service_approval_update_approver ON public.service_approval;
DROP POLICY IF EXISTS service_approval_update_admin_only ON public.service_approval;

CREATE POLICY service_approval_update_admin_only
ON public.service_approval
FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role]));

DROP POLICY IF EXISTS service_approval_delete_admin_only ON public.service_approval;
CREATE POLICY service_approval_delete_admin_only
ON public.service_approval
FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role]));

-- Approval rows must be authored by the authenticated account. The trigger
-- in the workflow-hardening migration overwrites the actor with auth.uid().
