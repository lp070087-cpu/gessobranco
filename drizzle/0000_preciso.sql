-- Independent Neon schema. Never run against the source Supabase database.
CREATE SCHEMA IF NOT EXISTS preciso;
CREATE TABLE IF NOT EXISTS preciso.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 full_name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'client' CHECK (role IN ('client','admin')),
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (email = lower(email))
);
CREATE TABLE IF NOT EXISTS preciso.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES preciso.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON preciso.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON preciso.sessions(expires_at);
CREATE TABLE IF NOT EXISTS preciso.login_attempts (
 key_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1,
 window_started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES preciso.users(id),
 name text NOT NULL, document text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.company_members (
 company_id uuid NOT NULL REFERENCES preciso.companies(id), user_id uuid NOT NULL REFERENCES preciso.users(id),
 PRIMARY KEY(company_id,user_id)
);
CREATE TABLE IF NOT EXISTS preciso.services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL,
 short_name text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0,
 description text NOT NULL DEFAULT '', price_per_m2 numeric(14,2) NOT NULL DEFAULT 0 CHECK(price_per_m2 >= 0),
 billing_unit text NOT NULL DEFAULT 'm2' CHECK(billing_unit IN ('m2','linear','unit','day','project','quote')),
 availability_notes text NOT NULL DEFAULT '',
 image_url text, is_active boolean NOT NULL DEFAULT true, available boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES preciso.users(id),
 company_id uuid REFERENCES preciso.companies(id), title text NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','reviewing','visit_required','proposed','approved','rejected','cancelled')),
 notes text NOT NULL DEFAULT '', project_type text NOT NULL DEFAULT 'residencial',
 preliminary boolean NOT NULL DEFAULT true, total numeric(16,2) NOT NULL DEFAULT 0 CHECK(total >= 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_user_idx ON preciso.quotes(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_company_idx ON preciso.quotes(company_id);
CREATE TABLE IF NOT EXISTS preciso.quote_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL REFERENCES preciso.quotes(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES preciso.services(id), environment text NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity > 0), unit_price numeric(14,2) NOT NULL CHECK(unit_price >= 0),
 billing_unit text NOT NULL, notes text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS preciso.quote_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL REFERENCES preciso.quotes(id),
 actor_id uuid NOT NULL REFERENCES preciso.users(id), status text NOT NULL, notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL UNIQUE REFERENCES preciso.quotes(id),
 user_id uuid NOT NULL REFERENCES preciso.users(id), company_id uuid REFERENCES preciso.companies(id),
 title text NOT NULL, responsible_id uuid REFERENCES preciso.users(id),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','paused','completed','cancelled')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 starts_on date, ends_on date, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON preciso.projects(user_id);
CREATE INDEX IF NOT EXISTS projects_company_idx ON preciso.projects(company_id);
CREATE TABLE IF NOT EXISTS preciso.project_stages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES preciso.projects(id),
 title text NOT NULL, responsible_id uuid REFERENCES preciso.users(id), starts_on date, ends_on date,
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), position integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS preciso.appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES preciso.users(id),
 quote_id uuid REFERENCES preciso.quotes(id), project_id uuid REFERENCES preciso.projects(id),
 kind text NOT NULL CHECK(kind IN ('visit','meeting','execution','inspection','completion')),
 scheduled_at timestamptz NOT NULL, address text NOT NULL, notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_user_date_idx ON preciso.appointments(user_id,scheduled_at);
CREATE TABLE IF NOT EXISTS preciso.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES preciso.projects(id),
 stage_id uuid REFERENCES preciso.project_stages(id), description text NOT NULL,
 amount numeric(16,2) NOT NULL CHECK(amount > 0), due_on date NOT NULL, received_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_project_idx ON preciso.payments(project_id);
CREATE TABLE IF NOT EXISTS preciso.attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid REFERENCES preciso.quotes(id),
 project_id uuid REFERENCES preciso.projects(id), user_id uuid NOT NULL REFERENCES preciso.users(id),
 storage_key text NOT NULL, filename text NOT NULL, content_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(quote_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS preciso.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES preciso.users(id),
 title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON preciso.notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS preciso.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES preciso.users(id),
 action text NOT NULL, target_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.platform_settings (
 key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid REFERENCES preciso.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Browser roles never receive access. All authorization occurs in the server API.
REVOKE ALL ON SCHEMA preciso FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA preciso FROM PUBLIC;
