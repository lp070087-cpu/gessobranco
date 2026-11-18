BEGIN;
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  business_name text NOT NULL CHECK (length(business_name) BETWEEN 1 AND 120),
  contact_email text NOT NULL DEFAULT '' CHECK (length(contact_email) <= 254),
  contact_phone text NOT NULL DEFAULT '' CHECK (length(contact_phone) <= 30),
  service_area text NOT NULL DEFAULT '' CHECK (length(service_area) <= 300),
  estimate_disclaimer text NOT NULL DEFAULT '' CHECK (length(estimate_disclaimer) <= 1500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin settings access" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMIT;
