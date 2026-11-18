-- Transitional Supabase hardening. Apply with an authorized database owner.
-- This migration preserves existing rows and administrator assignments.
BEGIN;

-- RLS policies invoke this predicate; it returns a boolean, never role rows.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _account_type public.account_type;
BEGIN
  -- Self-registration can never select an administrative/team role.
  _account_type := CASE NEW.raw_user_meta_data->>'account_type'
    WHEN 'empresa' THEN 'empresa'::public.account_type
    WHEN 'autonomo' THEN 'autonomo'::public.account_type
    ELSE 'cliente'::public.account_type END;
  INSERT INTO public.profiles
    (id,email,account_type,full_name,phone,company_name,responsible_name,cnpj)
  VALUES (NEW.id,NEW.email,_account_type,
    NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'company_name',NEW.raw_user_meta_data->>'responsible_name',
    NEW.raw_user_meta_data->>'cnpj');
  INSERT INTO public.user_roles(user_id,role)
  VALUES (NEW.id,_account_type::text::public.app_role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Public can view branded profiles" ON public.profiles;
CREATE POLICY "Own profile or administrator" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Administrators update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- The definer view deliberately exposes only approved, unblocked brand fields.
-- PII (email, phone, CNPJ and names of responsible people) is never projected.
CREATE OR REPLACE VIEW public.public_brand_profiles
WITH (security_barrier = true) AS
SELECT id,slug,company_name,logo_url,brand_color,tagline,description
FROM public.profiles
WHERE slug IS NOT NULL AND blocked = false AND company_status = 'aprovada';
REVOKE ALL ON public.public_brand_profiles FROM PUBLIC;
GRANT SELECT ON public.public_brand_profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_control_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Trusted maintenance through the database owner/service role remains possible.
  IF auth.role() = 'authenticated' AND NOT public.has_role(auth.uid(),'admin') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.blocked OR NEW.company_status <> 'pendente' OR NEW.parent_company_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only administrators may set account control fields' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.blocked IS DISTINCT FROM OLD.blocked
      OR NEW.company_status IS DISTINCT FROM OLD.company_status
      OR NEW.parent_company_id IS DISTINCT FROM OLD.parent_company_id
      OR NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'Only administrators may change account control fields' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_control_fields BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_control_fields();

CREATE OR REPLACE FUNCTION public.protect_quote_workflow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.has_role(auth.uid(),'admin') THEN
    -- Approved financial and measurement snapshots are immutable for customers.
    -- This also covers newly added economic columns without a stale allowlist.
    IF TG_OP = 'UPDATE' AND OLD.status::text IN ('aprovado','finalizado')
      AND (to_jsonb(NEW) - ARRAY['notes','photo_url','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes','photo_url','updated_at']) THEN
      RAISE EXCEPTION 'Approved quote values may only be changed by administrators' USING ERRCODE='42501';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status::text NOT IN ('estimado','aguardando_visita') THEN
        RAISE EXCEPTION 'Only administrators may approve or finish quotes' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR (NEW.status IS DISTINCT FROM OLD.status AND
        NOT (OLD.status::text='estimado' AND NEW.status::text='aguardando_visita')) THEN
      RAISE EXCEPTION 'Quote workflow is controlled by administrators' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_quote_workflow BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.protect_quote_workflow();

-- Preserve financial snapshots and quote history. Customers may not erase
-- requests, including drafts; removal is reserved for an authorized administrator.
DROP POLICY IF EXISTS "Users delete own quotes" ON public.quotes;
CREATE POLICY "Only administrators delete quotes" ON public.quotes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.protect_appointment_workflow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.has_role(auth.uid(),'admin') THEN
    IF TG_OP = 'INSERT' OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
      IF NEW.scheduled_date < CURRENT_DATE
        OR NEW.scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
        RAISE EXCEPTION 'Choose a valid future appointment date and time' USING ERRCODE='22023';
      END IF;
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status::text <> 'aguardando_confirmacao'
        OR NEW.professional_name IS NOT NULL OR NEW.admin_notes IS NOT NULL THEN
        RAISE EXCEPTION 'Appointment confirmation is controlled by administrators' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.professional_name IS DISTINCT FROM OLD.professional_name
      OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
      OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (
        NEW.status::text='cancelada' AND OLD.status::text IN ('aguardando_confirmacao','confirmado'))) THEN
      RAISE EXCEPTION 'Appointment workflow is controlled by administrators' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_appointment_workflow BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_workflow();

COMMIT;
