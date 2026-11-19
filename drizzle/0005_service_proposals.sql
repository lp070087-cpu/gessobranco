ALTER TABLE preciso.company_requests
  ADD COLUMN proposal jsonb CHECK (proposal IS NULL OR (kind = 'service' AND jsonb_typeof(proposal) = 'object'));

ALTER TABLE preciso.quote_items ADD COLUMN professional_work text NOT NULL DEFAULT '';
