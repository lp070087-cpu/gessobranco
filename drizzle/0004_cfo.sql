CREATE TABLE preciso.cfo_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES preciso.users(id),
  account text NOT NULL,
  file_name text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account,fingerprint)
);
CREATE TABLE preciso.cfo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES preciso.cfo_imports(id),
  account text NOT NULL,
  fingerprint text NOT NULL,
  booked_on date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents <> 0),
  classification text CHECK(classification IN ('external_revenue','external_expense','external_fee','external_cost','transfer')),
  reviewed_by uuid REFERENCES preciso.users(id),
  reviewed_at timestamptz,
  UNIQUE(account,fingerprint)
);
CREATE INDEX cfo_entries_date_idx ON preciso.cfo_entries(booked_on);
CREATE TABLE preciso.cfo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  source text NOT NULL CHECK(source IN ('manual','cron')),
  actor_id uuid REFERENCES preciso.users(id),
  start_on date NOT NULL,
  end_on date NOT NULL,
  status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
  attempts int NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  report jsonb,
  error text,
  CHECK(end_on >= start_on)
);
CREATE INDEX cfo_runs_history_idx ON preciso.cfo_runs(started_at DESC);
REVOKE ALL ON preciso.cfo_imports,preciso.cfo_entries,preciso.cfo_runs FROM PUBLIC;
