ALTER TABLE preciso.company_requests ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES preciso.users(id);
ALTER TABLE preciso.company_requests ADD COLUMN IF NOT EXISTS quoted_unit_price numeric(16,2);
ALTER TABLE preciso.quotes ADD COLUMN IF NOT EXISTS request_key uuid UNIQUE;
CREATE INDEX IF NOT EXISTS company_requests_owner_idx ON preciso.company_requests(user_id,created_at DESC) WHERE user_id IS NOT NULL;
CREATE TABLE preciso.staff_permissions (
  user_id uuid REFERENCES preciso.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK(permission IN ('service_requests','service_catalogue','service_agenda','service_projects','finance_cfo')),
  PRIMARY KEY(user_id,permission)
);
CREATE TABLE preciso.client_profiles (
  user_id uuid PRIMARY KEY REFERENCES preciso.users(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '',
  accepted_terms_at timestamptz
);
CREATE TABLE preciso.legacy_identities (
  subject uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES preciso.users(id)
);
ALTER TABLE preciso.commercial_customers ADD COLUMN IF NOT EXISTS account_user_id uuid UNIQUE REFERENCES preciso.users(id);
REVOKE ALL ON preciso.staff_permissions,preciso.client_profiles,preciso.legacy_identities FROM PUBLIC;
