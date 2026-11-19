ALTER TABLE preciso.client_profiles
  ADD COLUMN document_type text CHECK (document_type IN ('cpf','cnpj')),
  ADD COLUMN document text,
  ADD CONSTRAINT client_profiles_document_format CHECK (
    (document_type IS NULL AND document IS NULL) OR
    (document_type IS NOT NULL AND document IS NOT NULL AND (
      (document_type='cpf' AND document ~ '^[0-9]{11}$') OR
      (document_type='cnpj' AND document ~ '^[0-9A-Z]{12}[0-9]{2}$')
    ))
  );
