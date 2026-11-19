CREATE TABLE preciso.company_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('service','material')),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  subject text NOT NULL,
  product_id uuid REFERENCES preciso.commercial_products(id) ON DELETE SET NULL,
  unit_name text,
  quantity numeric(16,6),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_requests_created_idx ON preciso.company_requests(created_at DESC);
CREATE INDEX commercial_purchase_operation_idx ON preciso.commercial_operations ((result->>'id'))
  WHERE kind IN ('purchase','purchase_costs');
REVOKE ALL ON preciso.company_requests FROM PUBLIC;
