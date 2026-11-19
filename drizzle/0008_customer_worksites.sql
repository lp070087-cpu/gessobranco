CREATE TABLE preciso.customer_businesses (
  user_id uuid PRIMARY KEY REFERENCES preciso.client_profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  trade_name text NOT NULL DEFAULT ''
);

CREATE TABLE preciso.customer_worksites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES preciso.customer_businesses(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  property_type text NOT NULL CHECK (property_type IN ('apartment', 'house', 'commercial', 'other')),
  address text NOT NULL,
  unit text NOT NULL DEFAULT '',
  area_m2 numeric(11,2) NOT NULL CHECK (area_m2 > 0 AND area_m2 <= 1000000),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (property_type <> 'apartment' OR length(btrim(unit)) > 0)
);

CREATE INDEX customer_worksites_by_owner
  ON preciso.customer_worksites (user_id, created_at DESC, id);
