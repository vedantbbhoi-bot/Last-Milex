-- ============================================================================
-- DRAFT ONLY / NOT APPLIED
-- Last-Milex coordination RPCs, lifecycle enforcement, and expiry/dead-man work.
-- This file is a local review artifact. Do NOT apply to any shared/live database
-- without a separate review and explicit authorization.
-- Built against 20261023160000_core_schema.sql and 20261023160001_rls_policies.sql.
-- ============================================================================
-- Safety / scope notes:
-- * Existing UI signatures remain callable. create_batch has an optional request
--   UUID; the current DonorQueue persists and reuses the key plus exact payload for
--   uncertain online responses. This is not an offline write queue.
-- * One transaction-scoped advisory lock serializes this RPC set. Row locks then
--   follow parent batch -> child sub-batch -> shelter (UUID order) -> rider order.
-- * Shelters/riders have no travel-time model. Rerouting uses fresh rider GPS,
--   PostGIS straight-line distance, demand/resources and a 5-minute expiry buffer;
--   it cannot certify road ETA. Route-aware ETA gating is deliberately omitted.
-- * Judge RPCs are omitted: shelters have no demo/isolation marker, so an admin
--   injection could alter shared operational shelter state. Do not expose one.
-- * This RPC migration does not activate recurring jobs. An optional, separately
--   reviewed schedule draft is 20261024132001_dispatch_sweep_schedules_draft.sql.

BEGIN;

CREATE TABLE public.batch_create_requests (
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  quantity integer NOT NULL,
  dependency public.dependency_type NOT NULL,
  expires_at timestamptz NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (actor_id, request_id),
  CONSTRAINT batch_create_requests_quantity_check CHECK (quantity > 0)
);
ALTER TABLE public.batch_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.batch_create_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._refresh_batch_status(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_total integer;
  v_spoiled integer;
  v_open integer;
  v_transit integer;
  v_status public.batch_status;
BEGIN
  SELECT pg_catalog.count(*)::integer,
         COALESCE(pg_catalog.sum(sb.quantity) FILTER (WHERE sb.status = 'spoiled'), 0)::integer,
         COALESCE(pg_catalog.sum(sb.quantity) FILTER (WHERE sb.status IN ('available', 'claimed', 'in_transit', 'at_risk')), 0)::integer,
         pg_catalog.count(*) FILTER (WHERE sb.status = 'in_transit')::integer
    INTO v_total, v_spoiled, v_open, v_transit
    FROM public.sub_batches AS sb
   WHERE sb.batch_id = p_batch_id;

  IF v_total = 0 THEN
    v_status := 'open';
  ELSIF v_spoiled >= (SELECT b.quantity FROM public.batches AS b WHERE b.id = p_batch_id) THEN
    v_status := 'fully_spoiled';
  ELSIF v_spoiled > 0 THEN
    v_status := 'partially_spoiled';
  ELSIF v_open > 0 AND v_transit > 0 THEN
    v_status := 'in_transit';
  ELSIF v_open > 0 THEN
    v_status := 'split';
  ELSE
    v_status := 'completed';
  END IF;

  UPDATE public.batches AS b SET status = v_status WHERE b.id = p_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_batch(
  p_quantity integer,
  p_dependency public.dependency_type,
  p_expires_at timestamptz,
  p_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_saved public.batch_create_requests%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'donor' THEN RAISE EXCEPTION 'Donor role required' USING ERRCODE = '42501'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10000 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 10000';
  END IF;
  IF p_dependency IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Dependency and expiry are required';
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT r.* INTO v_saved FROM public.batch_create_requests AS r
     WHERE r.actor_id = v_actor AND r.request_id = p_request_id;
    IF FOUND THEN
      IF v_saved.quantity <> p_quantity OR v_saved.dependency <> p_dependency OR v_saved.expires_at <> p_expires_at THEN
        RAISE EXCEPTION 'Idempotency key was already used with a different payload';
      END IF;
      RETURN v_saved.batch_id;
    END IF;
  END IF;

  IF p_expires_at <= pg_catalog.clock_timestamp() OR p_expires_at > pg_catalog.clock_timestamp() + interval '72 hours' THEN
    RAISE EXCEPTION 'Expiry must be in the future and within 72 hours';
  END IF;

  INSERT INTO public.batches (donor_id, quantity, dependency, expires_at)
  VALUES (v_actor, p_quantity, p_dependency, p_expires_at)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.claim_audit (batch_id, actor_id, event, details)
  VALUES (v_batch_id, v_actor, 'batch_created', pg_catalog.jsonb_build_object('quantity', p_quantity, 'dependency', p_dependency::text));

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.batch_create_requests (actor_id, request_id, quantity, dependency, expires_at, batch_id)
    VALUES (v_actor, p_request_id, p_quantity, p_dependency, p_expires_at, v_batch_id);
  END IF;
  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.split_batch(p_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch public.batches%ROWTYPE;
  v_shelter record;
  v_capacity integer;
  v_remaining integer;
  v_free integer;
  v_take integer;
  v_children integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  SELECT b.* INTO v_batch FROM public.batches AS b WHERE b.id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_role IS DISTINCT FROM 'admin' AND v_batch.donor_id IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Batch owner or admin required' USING ERRCODE = '42501'; END IF;

  SELECT pg_catalog.count(*)::integer INTO v_children FROM public.sub_batches AS sb WHERE sb.batch_id = p_batch_id;
  IF v_children > 0 THEN RETURN v_children; END IF;
  IF v_batch.expires_at <= pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'Batch has expired and cannot be split'; END IF;
  IF v_batch.status <> 'open' THEN RAISE EXCEPTION 'Only an unsplit open batch can be split'; END IF;

  -- Lock eligible shelter rows in deterministic order before examining demand.
  PERFORM s.id FROM public.shelters AS s WHERE s.is_active ORDER BY s.id FOR UPDATE;
  SELECT pg_catalog.min(r.vehicle_capacity) INTO v_capacity
    FROM public.riders AS r
   WHERE r.status = 'available'
     AND r.last_heartbeat_at IS NOT NULL
     AND r.last_heartbeat_at >= pg_catalog.now() - interval '90 seconds';

  v_remaining := v_batch.quantity;
  FOR v_shelter IN
    SELECT s.id, s.current_demand, s.resources
      FROM public.shelters AS s
     WHERE s.is_active AND s.current_demand > 0
       AND public.dependency_compatible(v_batch.dependency, s.resources)
     ORDER BY s.current_demand DESC, s.id
  LOOP
    EXIT WHEN v_remaining <= 0 OR v_capacity IS NULL OR v_capacity <= 0;
    SELECT GREATEST(0, v_shelter.current_demand - COALESCE(pg_catalog.sum(sb.quantity), 0))::integer
      INTO v_free
      FROM public.sub_batches AS sb
     WHERE sb.shelter_id = v_shelter.id
       AND sb.status IN ('available', 'claimed', 'in_transit', 'at_risk');
    v_take := LEAST(v_remaining, v_free, v_capacity, 40);
    WHILE v_take > 0 LOOP
      INSERT INTO public.sub_batches (batch_id, shelter_id, quantity, dependency, status, expires_at)
      VALUES (p_batch_id, v_shelter.id, v_take, v_batch.dependency, 'available', v_batch.expires_at);
      v_remaining := v_remaining - v_take;
      v_free := v_free - v_take;
      v_children := v_children + 1;
      v_take := LEAST(v_remaining, v_free, v_capacity, 40);
    END LOOP;
  END LOOP;

  -- Preserve every remaining unit as an explicit, non-claimable at-risk child.
  WHILE v_remaining > 0 LOOP
    v_take := LEAST(v_remaining, 40);
    INSERT INTO public.sub_batches (batch_id, quantity, dependency, status, expires_at)
    VALUES (p_batch_id, v_take, v_batch.dependency, 'at_risk', v_batch.expires_at);
    v_remaining := v_remaining - v_take;
    v_children := v_children + 1;
  END LOOP;

  UPDATE public.batches AS b SET status = 'split' WHERE b.id = p_batch_id;
  INSERT INTO public.claim_audit (batch_id, actor_id, event, details)
  VALUES (p_batch_id, v_actor, 'batch_split', pg_catalog.jsonb_build_object('children', v_children));
  RETURN v_children;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_sub_batch(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_rider public.riders%ROWTYPE;
  v_shelter public.shelters%ROWTYPE;
  v_reserved integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT sb.batch_id INTO v_batch_id FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub-batch not found'; END IF;
  PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id FOR UPDATE;
  IF v_child.status IN ('claimed', 'in_transit') AND v_child.rider_id = v_actor THEN
    IF v_child.expires_at <= pg_catalog.clock_timestamp()
       OR (v_child.status = 'claimed' AND (v_child.confirmation_deadline IS NULL OR v_child.confirmation_deadline <= pg_catalog.clock_timestamp()))
       OR v_child.heartbeat_at IS NULL
       OR v_child.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds' THEN
      RAISE EXCEPTION 'Existing assignment is stale or expired; refresh and wait for server reconciliation';
    END IF;
    RETURN true;
  END IF;
  IF v_child.status <> 'available' OR v_child.expires_at <= pg_catalog.now() THEN RAISE EXCEPTION 'Sub-batch is not claimable'; END IF;

  SELECT s.* INTO v_shelter FROM public.shelters AS s WHERE s.id = v_child.shelter_id FOR UPDATE;
  IF NOT FOUND OR NOT v_shelter.is_active OR v_shelter.current_demand <= 0 THEN RAISE EXCEPTION 'Assigned shelter is unavailable or has no demand'; END IF;
  IF NOT public.dependency_compatible(v_child.dependency, v_shelter.resources) THEN RAISE EXCEPTION 'Assigned shelter lacks required resources'; END IF;
  SELECT COALESCE(pg_catalog.sum(sb.quantity), 0)::integer INTO v_reserved
    FROM public.sub_batches AS sb
   WHERE sb.shelter_id = v_shelter.id AND sb.id <> v_child.id
     AND sb.status IN ('available', 'claimed', 'in_transit', 'at_risk');
  IF v_shelter.current_demand - v_reserved < v_child.quantity THEN RAISE EXCEPTION 'Shelter demand is already reserved'; END IF;

  SELECT r.* INTO v_rider FROM public.riders AS r WHERE r.profile_id = v_actor FOR UPDATE;
  IF NOT FOUND OR v_rider.status <> 'available' THEN RAISE EXCEPTION 'Rider is not available'; END IF;
  IF v_rider.last_heartbeat_at IS NULL OR v_rider.last_heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds' THEN
    RAISE EXCEPTION 'Rider availability is stale; reconnect and re-establish presence before claiming';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sub_batches AS sb WHERE sb.rider_id = v_actor AND sb.status IN ('claimed', 'in_transit', 'at_risk')) THEN
    RAISE EXCEPTION 'Rider already has active or at-risk cargo';
  END IF;
  IF v_child.quantity > v_rider.vehicle_capacity THEN RAISE EXCEPTION 'Load exceeds rider vehicle capacity'; END IF;

  UPDATE public.sub_batches AS sb
     SET status = 'claimed', rider_id = v_actor, claimed_at = pg_catalog.now(),
         confirmation_deadline = pg_catalog.now() + interval '5 minutes', heartbeat_at = pg_catalog.now()
   WHERE sb.id = v_child.id;
  UPDATE public.riders AS r SET status = 'busy', last_heartbeat_at = pg_catalog.now() WHERE r.profile_id = v_actor;
  INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
  VALUES (v_batch_id, v_child.id, v_actor, 'claimed', pg_catalog.jsonb_build_object('confirmation_deadline', pg_catalog.now() + interval '5 minutes'));
  PERFORM public._refresh_batch_status(v_batch_id);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_now timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT sb.batch_id INTO v_batch_id FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub-batch not found'; END IF;
  PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id FOR UPDATE;
  IF v_child.rider_id <> v_actor OR v_child.status NOT IN ('claimed', 'in_transit') THEN
    RAISE EXCEPTION 'Heartbeat is only valid for the assigned rider on active cargo' USING ERRCODE = '42501';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_child.heartbeat_at IS NULL OR v_child.heartbeat_at <= v_now - interval '90 seconds' THEN
    RAISE EXCEPTION 'Heartbeat is stale; do not revive this assignment. Wait for server reconciliation.';
  END IF;
  IF v_child.expires_at <= v_now OR (v_child.status = 'claimed' AND (v_child.confirmation_deadline IS NULL OR v_child.confirmation_deadline <= v_now)) THEN
    RAISE EXCEPTION 'Assignment expired; do not extend it with a late heartbeat.';
  END IF;
  UPDATE public.sub_batches AS sb SET heartbeat_at = v_now WHERE sb.id = v_child.id;
  UPDATE public.riders AS r SET last_heartbeat_at = v_now WHERE r.profile_id = v_actor;
  INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
  VALUES (v_batch_id, v_child.id, v_actor, 'heartbeat', '{}'::jsonb);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rider_presence()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_status public.rider_status;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT r.status INTO v_status FROM public.riders AS r WHERE r.profile_id = v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rider profile is not configured' USING ERRCODE = '42501'; END IF;
  IF v_status = 'needs_check' THEN RAISE EXCEPTION 'Human verification is required before this rider can become available'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.sub_batches AS sb
     WHERE sb.rider_id = v_actor AND sb.status IN ('claimed', 'in_transit', 'at_risk')
  ) THEN
    RAISE EXCEPTION 'Rider has active or at-risk cargo and cannot advertise availability';
  END IF;
  UPDATE public.riders AS r SET status = 'available', last_heartbeat_at = v_now WHERE r.profile_id = v_actor;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_dispatch(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_shelter public.shelters%ROWTYPE;
  v_reserved integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT sb.batch_id INTO v_batch_id FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub-batch not found'; END IF;
  PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id FOR UPDATE;
  IF v_child.rider_id <> v_actor OR v_child.status <> 'claimed' THEN RAISE EXCEPTION 'Only the assigned rider may validate a claimed load' USING ERRCODE = '42501'; END IF;
  IF v_child.expires_at <= pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'Load has expired'; END IF;
  IF v_child.confirmation_deadline IS NULL OR v_child.confirmation_deadline <= pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'Pickup confirmation deadline has passed'; END IF;
  IF v_child.heartbeat_at IS NULL OR v_child.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds' THEN RAISE EXCEPTION 'Rider heartbeat is stale; refresh presence before confirming pickup'; END IF;

  SELECT s.* INTO v_shelter FROM public.shelters AS s WHERE s.id = v_child.shelter_id FOR UPDATE;
  IF NOT FOUND OR NOT v_shelter.is_active THEN RAISE EXCEPTION 'Assigned shelter is inactive'; END IF;
  IF v_shelter.current_demand <= 0 THEN RAISE EXCEPTION 'Assigned shelter has no remaining demand'; END IF;
  IF NOT public.dependency_compatible(v_child.dependency, v_shelter.resources) THEN RAISE EXCEPTION 'Dependency violation: destination lacks required water or fuel'; END IF;
  SELECT COALESCE(pg_catalog.sum(sb.quantity), 0)::integer INTO v_reserved
    FROM public.sub_batches AS sb
   WHERE sb.shelter_id = v_shelter.id AND sb.id <> v_child.id
     AND sb.status IN ('available', 'claimed', 'in_transit', 'at_risk');
  IF v_shelter.current_demand - v_reserved < v_child.quantity THEN RAISE EXCEPTION 'Shelter demand is already allocated to other loads'; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_pickup(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT sb.batch_id INTO v_batch_id FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub-batch not found'; END IF;
  PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id FOR UPDATE;
  IF v_child.rider_id = v_actor AND v_child.status = 'in_transit' THEN
    IF v_child.expires_at <= pg_catalog.clock_timestamp()
       OR v_child.heartbeat_at IS NULL
       OR v_child.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds' THEN
      RAISE EXCEPTION 'Existing pickup is stale or expired; refresh and request human verification';
    END IF;
    RETURN true;
  END IF;
  IF v_child.rider_id <> v_actor OR v_child.status <> 'claimed' THEN RAISE EXCEPTION 'Only the assigned rider may confirm a claimed load' USING ERRCODE = '42501'; END IF;
  PERFORM public.validate_dispatch(p_sub_batch_id);
  UPDATE public.sub_batches AS sb SET status = 'in_transit', picked_up_at = pg_catalog.now(), heartbeat_at = pg_catalog.now() WHERE sb.id = v_child.id;
  INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
  VALUES (v_batch_id, v_child.id, v_actor, 'picked_up', '{}'::jsonb);
  PERFORM public._refresh_batch_status(v_batch_id);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deliver_sub_batch(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_shelter public.shelters%ROWTYPE;
  v_reserved integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles AS p WHERE p.id = v_actor;
  IF v_role IS DISTINCT FROM 'rider' THEN RAISE EXCEPTION 'Rider role required' USING ERRCODE = '42501'; END IF;
  SELECT sb.batch_id INTO v_batch_id FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub-batch not found'; END IF;
  PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id FOR UPDATE;
  IF v_child.rider_id <> v_actor THEN RAISE EXCEPTION 'Only the assigned rider may deliver this load' USING ERRCODE = '42501'; END IF;
  IF v_child.status = 'delivered' THEN RETURN true; END IF;
  IF v_child.status <> 'in_transit' THEN RAISE EXCEPTION 'Only in-transit cargo can be delivered'; END IF;
  IF v_child.expires_at <= pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'Load has expired and cannot be delivered'; END IF;
  IF v_child.heartbeat_at IS NULL OR v_child.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds' THEN
    RAISE EXCEPTION 'Rider heartbeat is stale; delivery is blocked pending human verification';
  END IF;

  SELECT s.* INTO v_shelter FROM public.shelters AS s WHERE s.id = v_child.shelter_id FOR UPDATE;
  IF NOT FOUND OR NOT v_shelter.is_active THEN RAISE EXCEPTION 'Current destination is inactive'; END IF;
  IF NOT public.dependency_compatible(v_child.dependency, v_shelter.resources) THEN RAISE EXCEPTION 'Dependency violation at delivery destination'; END IF;
  IF v_shelter.current_demand < v_child.quantity THEN RAISE EXCEPTION 'Destination demand changed; human verification is required'; END IF;
  SELECT COALESCE(pg_catalog.sum(other.quantity), 0)::integer INTO v_reserved
    FROM public.sub_batches AS other
   WHERE other.shelter_id = v_shelter.id AND other.id <> v_child.id
     AND other.status IN ('available', 'claimed', 'in_transit', 'at_risk');
  IF v_shelter.current_demand - v_child.quantity < v_reserved THEN
    RAISE EXCEPTION 'Delivery would reduce shelter demand below other live reservations; human reconciliation is required';
  END IF;

  UPDATE public.sub_batches AS sb SET status = 'delivered', delivered_at = pg_catalog.now() WHERE sb.id = v_child.id;
  UPDATE public.shelters AS s SET current_demand = s.current_demand - v_child.quantity WHERE s.id = v_shelter.id;
  INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
  VALUES (v_batch_id, v_child.id, v_actor, 'delivered', pg_catalog.jsonb_build_object('shelter_id', v_shelter.id, 'quantity', v_child.quantity));
  UPDATE public.riders AS r
     SET status = CASE WHEN r.status = 'needs_check' THEN 'needs_check'::public.rider_status WHEN EXISTS (
       SELECT 1 FROM public.sub_batches AS sb WHERE sb.rider_id = v_actor AND sb.id <> v_child.id AND sb.status IN ('claimed', 'in_transit', 'at_risk')
     ) THEN 'needs_check'::public.rider_status ELSE 'available'::public.rider_status END,
         last_heartbeat_at = pg_catalog.clock_timestamp()
   WHERE r.profile_id = v_actor;
  PERFORM public._refresh_batch_status(v_batch_id);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_alternative_shelter(p_sub_batch_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_child public.sub_batches%ROWTYPE;
  v_rider_location extensions.geography;
  v_location_time timestamptz;
  v_shelter_id uuid;
BEGIN
  SELECT sb.* INTO v_child FROM public.sub_batches AS sb WHERE sb.id = p_sub_batch_id;
  IF NOT FOUND OR v_child.status <> 'in_transit' OR v_child.rider_id IS NULL THEN RETURN NULL; END IF;
  SELECT r.location, r.location_updated_at INTO v_rider_location, v_location_time
    FROM public.riders AS r WHERE r.profile_id = v_child.rider_id;
  IF v_rider_location IS NULL OR v_location_time IS NULL OR v_location_time < pg_catalog.now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF v_child.expires_at <= pg_catalog.now() + interval '5 minutes' THEN RETURN NULL; END IF;

  SELECT s.id INTO v_shelter_id
    FROM public.shelters AS s
   WHERE s.id <> v_child.shelter_id
     AND s.is_active AND s.current_demand > 0
     AND public.dependency_compatible(v_child.dependency, s.resources)
     AND s.current_demand - COALESCE((
       SELECT pg_catalog.sum(other.quantity)
         FROM public.sub_batches AS other
        WHERE other.shelter_id = s.id AND other.id <> v_child.id
          AND other.status IN ('available', 'claimed', 'in_transit', 'at_risk')
     ), 0) >= v_child.quantity
   ORDER BY extensions.ST_Distance(s.location, v_rider_location), s.id
   LIMIT 1;
  RETURN v_shelter_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._serialize_shelter_state_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- BEFORE STATEMENT runs before shelter tuple locks are acquired.
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER shelters_serialize_state_write
BEFORE UPDATE OF current_demand, resources, is_active ON public.shelters
FOR EACH STATEMENT
EXECUTE FUNCTION public._serialize_shelter_state_write();

CREATE OR REPLACE FUNCTION public.handle_shelter_shock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_child public.sub_batches%ROWTYPE;
  v_alternative uuid;
  v_distance double precision;
BEGIN
  IF OLD.current_demand <= 0 OR NEW.current_demand <> 0 THEN RETURN NEW; END IF;

  FOR v_child IN
    SELECT sb.* FROM public.sub_batches AS sb
     WHERE sb.shelter_id = NEW.id AND sb.status = 'in_transit'
     ORDER BY sb.id FOR UPDATE
  LOOP
    v_alternative := public.find_alternative_shelter(v_child.id);
    IF v_alternative IS NOT NULL THEN
      SELECT extensions.ST_Distance(s.location, r.location) INTO v_distance
        FROM public.shelters AS s CROSS JOIN public.riders AS r
       WHERE s.id = v_alternative AND r.profile_id = v_child.rider_id;
      UPDATE public.sub_batches AS sb SET shelter_id = v_alternative WHERE sb.id = v_child.id;
      INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
      VALUES (v_child.batch_id, v_child.id, NULL, 'rerouted',
        pg_catalog.jsonb_build_object('old_shelter_id', NEW.id, 'new_shelter_id', v_alternative,
          'straight_line_distance_m', v_distance, 'eta_checked', false));
    ELSE
      UPDATE public.sub_batches AS sb SET status = 'at_risk' WHERE sb.id = v_child.id;
      INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
      VALUES (v_child.batch_id, v_child.id, NULL, 'reroute_unavailable',
        pg_catalog.jsonb_build_object('shelter_id', NEW.id, 'reason', 'No compatible, demand-safe target with fresh rider location and more than five minutes remaining; ETA is not modeled'));
    END IF;
    PERFORM public._refresh_batch_status(v_child.batch_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER shelters_shock_reroute
AFTER UPDATE OF current_demand ON public.shelters
FOR EACH ROW
WHEN (OLD.current_demand > 0 AND NEW.current_demand = 0)
EXECUTE FUNCTION public.handle_shelter_shock();

CREATE OR REPLACE FUNCTION public.dead_man_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_shelter public.shelters%ROWTYPE;
  v_reserved integer;
  v_can_reoffer boolean;
  v_count integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  FOR v_batch_id IN
    SELECT DISTINCT sb.batch_id FROM public.sub_batches AS sb
     WHERE (sb.status = 'claimed' AND (sb.confirmation_deadline <= pg_catalog.clock_timestamp() OR sb.heartbeat_at IS NULL OR sb.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds'))
        OR (sb.status = 'in_transit' AND (sb.heartbeat_at IS NULL OR sb.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds'))
     ORDER BY sb.batch_id
  LOOP
    PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
    FOR v_child IN
      SELECT sb.* FROM public.sub_batches AS sb
       WHERE sb.batch_id = v_batch_id
         AND ((sb.status = 'claimed' AND (sb.confirmation_deadline <= pg_catalog.clock_timestamp() OR sb.heartbeat_at IS NULL OR sb.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds'))
           OR (sb.status = 'in_transit' AND (sb.heartbeat_at IS NULL OR sb.heartbeat_at <= pg_catalog.clock_timestamp() - interval '90 seconds')))
       ORDER BY sb.id FOR UPDATE
    LOOP
      v_can_reoffer := false;
      IF v_child.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.sub_batches AS sb SET status = 'spoiled' WHERE sb.id = v_child.id;
        UPDATE public.riders AS r
           SET status = CASE WHEN v_child.status = 'in_transit' THEN 'needs_check'::public.rider_status ELSE 'offline'::public.rider_status END
         WHERE r.profile_id = v_child.rider_id
           AND NOT EXISTS (SELECT 1 FROM public.sub_batches AS other WHERE other.rider_id = r.profile_id AND other.id <> v_child.id AND other.status IN ('claimed', 'in_transit', 'at_risk'));
        INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
        VALUES (v_batch_id, v_child.id, NULL, 'spoiled', pg_catalog.jsonb_build_object('reason', 'expired_before_dead_man_processing', 'prior_status', v_child.status::text));
      ELSIF v_child.status = 'claimed' THEN
        SELECT s.* INTO v_shelter FROM public.shelters AS s WHERE s.id = v_child.shelter_id FOR UPDATE;
        IF FOUND AND v_shelter.is_active AND public.dependency_compatible(v_child.dependency, v_shelter.resources) THEN
          SELECT COALESCE(pg_catalog.sum(other.quantity), 0)::integer INTO v_reserved
            FROM public.sub_batches AS other
           WHERE other.shelter_id = v_shelter.id AND other.id <> v_child.id
             AND other.status IN ('available', 'claimed', 'in_transit', 'at_risk');
          v_can_reoffer := v_shelter.current_demand - v_reserved >= v_child.quantity;
        END IF;
        UPDATE public.sub_batches AS sb
           SET status = CASE WHEN v_can_reoffer THEN 'available'::public.sub_batch_status ELSE 'at_risk'::public.sub_batch_status END,
               rider_id = NULL, claimed_at = NULL, confirmation_deadline = NULL, heartbeat_at = NULL
         WHERE sb.id = v_child.id;
        UPDATE public.riders AS r SET status = 'offline'
         WHERE r.profile_id = v_child.rider_id AND r.status = 'busy'
           AND NOT EXISTS (SELECT 1 FROM public.sub_batches AS other WHERE other.rider_id = r.profile_id AND other.id <> v_child.id AND other.status IN ('claimed', 'in_transit', 'at_risk'));
      ELSE
        -- Picked-up cargo is retained by its rider and is never made claimable.
        UPDATE public.sub_batches AS sb SET status = 'at_risk' WHERE sb.id = v_child.id;
        UPDATE public.riders AS r SET status = 'needs_check' WHERE r.profile_id = v_child.rider_id;
      END IF;
      INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
      VALUES (v_batch_id, v_child.id, NULL,
        CASE WHEN v_child.status = 'claimed' THEN 'dead_man_revoked' ELSE 'reroute_unavailable' END,
        pg_catalog.jsonb_build_object('prior_status', v_child.status::text,
          'action', CASE WHEN v_child.status = 'claimed' AND v_can_reoffer THEN 'claim_revoked_and_reoffered' WHEN v_child.status = 'claimed' THEN 'claim_revoked_but_marked_at_risk_for_manual_reconciliation' ELSE 'in_transit_flagged_at_risk_not_reoffered_due_to_stale_heartbeat' END,
          'threshold_seconds', 90));
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._refresh_batch_status(v_batch_id);
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expiry_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_batch_id uuid;
  v_child public.sub_batches%ROWTYPE;
  v_count integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(741152, 1);
  -- Expire open parents that never produced children; otherwise they remain
  -- visibly open forever because the child-row loop below cannot find them.
  FOR v_batch_id IN
    SELECT b.id FROM public.batches AS b
     WHERE b.status = 'open'
       AND b.expires_at <= pg_catalog.clock_timestamp()
       AND NOT EXISTS (SELECT 1 FROM public.sub_batches AS sb WHERE sb.batch_id = b.id)
     ORDER BY b.id
     FOR UPDATE
  LOOP
    UPDATE public.batches AS b SET status = 'fully_spoiled'
     WHERE b.id = v_batch_id AND b.status = 'open';
    IF FOUND THEN
      INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
      SELECT v_batch_id, NULL, NULL, 'spoiled',
             pg_catalog.jsonb_build_object('reason', 'parent_expired_before_split', 'quantity', b.quantity, 'expires_at', b.expires_at)
        FROM public.batches AS b WHERE b.id = v_batch_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  FOR v_batch_id IN
    SELECT DISTINCT sb.batch_id FROM public.sub_batches AS sb
     WHERE sb.expires_at <= pg_catalog.now() AND sb.status NOT IN ('delivered', 'spoiled', 'cancelled')
     ORDER BY sb.batch_id
  LOOP
    PERFORM 1 FROM public.batches AS b WHERE b.id = v_batch_id FOR UPDATE;
    FOR v_child IN
      SELECT sb.* FROM public.sub_batches AS sb
       WHERE sb.batch_id = v_batch_id AND sb.expires_at <= pg_catalog.now()
         AND sb.status NOT IN ('delivered', 'spoiled', 'cancelled')
       ORDER BY sb.id FOR UPDATE
    LOOP
      UPDATE public.sub_batches AS sb SET status = 'spoiled' WHERE sb.id = v_child.id;
      IF v_child.rider_id IS NOT NULL THEN
        UPDATE public.riders AS r SET status = CASE WHEN v_child.status = 'in_transit' THEN 'needs_check'::public.rider_status ELSE 'available'::public.rider_status END
         WHERE r.profile_id = v_child.rider_id AND NOT EXISTS (
           SELECT 1 FROM public.sub_batches AS other WHERE other.rider_id = v_child.rider_id AND other.id <> v_child.id AND other.status IN ('claimed', 'in_transit', 'at_risk')
         );
      END IF;
      INSERT INTO public.claim_audit (batch_id, sub_batch_id, actor_id, event, details)
      VALUES (v_batch_id, v_child.id, NULL, 'spoiled', pg_catalog.jsonb_build_object('expired_at', v_child.expires_at, 'prior_status', v_child.status::text));
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._refresh_batch_status(v_batch_id);
  END LOOP;
  RETURN v_count;
END;
$function$;

-- All functions are SECURITY DEFINER with an empty search_path. Internal helpers,
-- trigger code, and privileged sweeps remain unavailable to API roles by default.
REVOKE ALL ON FUNCTION public._refresh_batch_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_batch(integer, public.dependency_type, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.split_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_sub_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_presence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_dispatch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_pickup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_sub_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_alternative_shelter(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._serialize_shelter_state_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_shelter_shock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dead_man_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expiry_sweep() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_batch(integer, public.dependency_type, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sub_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_dispatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pickup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_sub_batch(uuid) TO authenticated;

COMMIT;
