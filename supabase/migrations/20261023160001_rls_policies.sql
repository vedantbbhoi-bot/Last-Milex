-- Reviewed access matrix implemented in this migration.
-- No anonymous operational reads; no direct state-transition writes from the browser.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON TYPE public.user_role, public.dependency_type, public.batch_status,
  public.sub_batch_status, public.rider_status TO authenticated;

GRANT SELECT ON TABLE public.profiles, public.riders, public.shelters,
  public.shelter_members, public.batches, public.sub_batches, public.claim_audit
  TO authenticated;
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;

CREATE POLICY profiles_read_self_or_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_display_name_only
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY batches_read_owner_shelter_or_admin
  ON public.batches FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR donor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sub_batches AS sb
      WHERE sb.batch_id = batches.id
        AND (
          sb.rider_id = auth.uid()
          OR public.is_shelter_member(sb.shelter_id)
        )
    )
  );

CREATE POLICY sub_batches_read_relevant_rows
  ON public.sub_batches FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_batch_owner(batch_id)
    OR rider_id = auth.uid()
    OR (status = 'available' AND public.current_role() = 'rider')
    OR public.is_shelter_member(shelter_id)
  );

CREATE POLICY shelters_read_operational_board
  ON public.shelters FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY riders_read_self_linked_or_admin
  ON public.riders FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.sub_batches AS sb
      WHERE sb.rider_id = riders.profile_id
        AND (
          public.is_batch_owner(sb.batch_id)
          OR public.is_shelter_member(sb.shelter_id)
        )
    )
  );

CREATE POLICY shelter_members_read_self_or_admin
  ON public.shelter_members FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY claim_audit_read_related_or_admin
  ON public.claim_audit FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR actor_id = auth.uid()
    OR (batch_id IS NOT NULL AND public.is_batch_owner(batch_id))
    OR EXISTS (
      SELECT 1 FROM public.sub_batches AS sb
      WHERE sb.id = claim_audit.sub_batch_id
        AND (
          sb.rider_id = auth.uid()
          OR public.is_shelter_member(sb.shelter_id)
        )
    )
  );

-- Browser writes to batches, sub_batches, riders, shelters, shelter_members,
-- and claim_audit remain revoked. Narrow SECURITY DEFINER RPCs are granted later.
