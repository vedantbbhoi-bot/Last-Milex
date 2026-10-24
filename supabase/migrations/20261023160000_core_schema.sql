-- Last-Mile Spoilage Trap: core schema (PostgreSQL 17)
-- RLS is enabled and all client privileges are revoked in this migration.
-- The separate policy migration grants only the reviewed authenticated reads.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TYPE public.user_role AS ENUM ('donor', 'rider', 'shelter', 'admin');
CREATE TYPE public.dependency_type AS ENUM ('none', 'water', 'fuel', 'both');
CREATE TYPE public.batch_status AS ENUM ('open', 'split', 'in_transit', 'partially_spoiled', 'fully_spoiled', 'completed');
CREATE TYPE public.sub_batch_status AS ENUM ('available', 'claimed', 'in_transit', 'delivered', 'spoiled', 'at_risk', 'cancelled');
CREATE TYPE public.rider_status AS ENUM ('available', 'busy', 'offline', 'needs_check');

CREATE OR REPLACE FUNCTION public.resource_flag(p_resources jsonb, p_key text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE lower(coalesce(p_resources ->> p_key, ''))
    WHEN 'true' THEN true
    WHEN '1' THEN true
    WHEN 'yes' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.dependency_compatible(p_dependency public.dependency_type, p_resources jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_dependency
    WHEN 'none' THEN true
    WHEN 'water' THEN public.resource_flag(p_resources, 'water')
    WHEN 'fuel' THEN public.resource_flag(p_resources, 'fuel')
    WHEN 'both' THEN public.resource_flag(p_resources, 'water') AND public.resource_flag(p_resources, 'fuel')
  END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 80),
  role public.user_role NOT NULL DEFAULT 'donor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.riders (
  profile_id uuid PRIMARY KEY,
  status public.rider_status NOT NULL DEFAULT 'offline',
  vehicle_capacity integer NOT NULL DEFAULT 40 CHECK (vehicle_capacity BETWEEN 1 AND 40),
  latitude double precision,
  longitude double precision,
  location extensions.geography(POINT, 4326),
  location_updated_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT riders_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT riders_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT riders_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE public.shelters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location extensions.geography(POINT, 4326) NOT NULL,
  location_updated_at timestamptz NOT NULL DEFAULT now(),
  capacity integer NOT NULL CHECK (capacity >= 0),
  current_demand integer NOT NULL DEFAULT 0 CHECK (current_demand >= 0),
  resources jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(resources) = 'object'),
  has_water boolean GENERATED ALWAYS AS (public.resource_flag(resources, 'water')) STORED,
  has_fuel boolean GENERATED ALWAYS AS (public.resource_flag(resources, 'fuel')) STORED,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shelter_members (
  shelter_id uuid NOT NULL REFERENCES public.shelters(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shelter_id, profile_id)
);

CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  dependency public.dependency_type NOT NULL DEFAULT 'none',
  expires_at timestamptz NOT NULL,
  status public.batch_status NOT NULL DEFAULT 'open',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE TABLE public.sub_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  shelter_id uuid REFERENCES public.shelters(id) ON DELETE SET NULL,
  rider_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 40),
  dependency public.dependency_type NOT NULL,
  status public.sub_batch_status NOT NULL DEFAULT 'available',
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  confirmation_deadline timestamptz,
  heartbeat_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sub_batches_available_has_shelter CHECK (status <> 'available' OR (shelter_id IS NOT NULL AND rider_id IS NULL)),
  CONSTRAINT sub_batches_claim_has_deadline CHECK (status NOT IN ('claimed', 'in_transit') OR (shelter_id IS NOT NULL AND rider_id IS NOT NULL AND claimed_at IS NOT NULL)),
  CONSTRAINT sub_batches_claim_deadline_check CHECK (status <> 'claimed' OR confirmation_deadline IS NOT NULL),
  CONSTRAINT sub_batches_transit_has_pickup CHECK (status <> 'in_transit' OR picked_up_at IS NOT NULL),
  CONSTRAINT sub_batches_delivery_timestamp CHECK (status <> 'delivered' OR delivered_at IS NOT NULL)
);

CREATE TABLE public.claim_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  sub_batch_id uuid REFERENCES public.sub_batches(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN (
    'batch_created', 'batch_split', 'claimed', 'heartbeat', 'dead_man_revoked',
    'picked_up', 'delivered', 'rerouted', 'reroute_unavailable', 'spoiled',
    'dependency_violation', 'judge_scenario', 'shelter_state_changed'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shelters_location_gix ON public.shelters USING gist (location);
CREATE INDEX shelters_demand_idx ON public.shelters (current_demand, id) WHERE is_active;
CREATE INDEX riders_location_gix ON public.riders USING gist (location);
CREATE INDEX riders_status_heartbeat_idx ON public.riders (status, last_heartbeat_at);
CREATE INDEX batches_donor_created_idx ON public.batches (donor_id, created_at DESC);
CREATE INDEX batches_expiry_idx ON public.batches (expires_at) WHERE status NOT IN ('completed', 'fully_spoiled');
CREATE INDEX sub_batches_parent_idx ON public.sub_batches (batch_id, created_at);
CREATE INDEX sub_batches_shelter_active_idx ON public.sub_batches (shelter_id, status) WHERE status IN ('available', 'claimed', 'in_transit');
CREATE INDEX sub_batches_rider_active_idx ON public.sub_batches (rider_id, status) WHERE status IN ('claimed', 'in_transit');
CREATE INDEX sub_batches_expiry_idx ON public.sub_batches (expires_at) WHERE status NOT IN ('delivered', 'spoiled', 'cancelled');
CREATE INDEX claim_audit_batch_created_idx ON public.claim_audit (batch_id, created_at DESC);
CREATE INDEX claim_audit_sub_batch_created_idx ON public.claim_audit (sub_batch_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_geography_from_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.location := NULL;
    NEW.location_updated_at := now();
  ELSE
    NEW.location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::extensions.geography;
    NEW.location_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER riders_set_updated_at BEFORE UPDATE ON public.riders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shelters_set_updated_at BEFORE UPDATE ON public.shelters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER batches_set_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sub_batches_set_updated_at BEFORE UPDATE ON public.sub_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER riders_sync_geography BEFORE INSERT OR UPDATE OF latitude, longitude ON public.riders FOR EACH ROW EXECUTE FUNCTION public.sync_geography_from_coordinates();
CREATE TRIGGER shelters_sync_geography BEFORE INSERT OR UPDATE OF latitude, longitude ON public.shelters FOR EACH ROW EXECUTE FUNCTION public.sync_geography_from_coordinates();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    NULLIF(left(coalesce(NEW.raw_user_meta_data ->> 'display_name', ''), 80), ''),
    'donor'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role::text FROM public.profiles AS p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(public.current_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_batch_owner(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.batches AS b WHERE b.id = p_batch_id AND b.donor_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_shelter_member(p_shelter_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_shelter_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.shelter_members AS sm
    WHERE sm.shelter_id = p_shelter_id AND sm.profile_id = auth.uid()
  );
$$;

-- Start fail-closed. The next migration creates reviewed SELECT policies and grants.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelter_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles, public.riders, public.shelters, public.shelter_members,
  public.batches, public.sub_batches, public.claim_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_geography_from_coordinates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resource_flag(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dependency_compatible(public.dependency_type, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_batch_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_shelter_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_batch_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shelter_member(uuid) TO authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['batches', 'sub_batches', 'riders', 'shelters', 'claim_audit'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
      ) THEN
        EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;
