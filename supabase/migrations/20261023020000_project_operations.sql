-- Operational extension. Apply only after a verified backup of the existing database.
BEGIN;

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS billing_unit text NOT NULL DEFAULT 'm2';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS availability_notes text NOT NULL DEFAULT '';
ALTER TABLE public.services ADD CONSTRAINT services_billing_unit_check CHECK
  (billing_unit IN ('m2','linear','unit','day','project','quote'));
CREATE POLICY "Public active catalog" ON public.services FOR SELECT TO anon USING (is_active);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL UNIQUE REFERENCES public.quotes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 180),
  kind text NOT NULL DEFAULT 'residencial' CHECK (kind IN ('residencial','casa','edificio','condominio','fachada','comercial')),
  status text NOT NULL DEFAULT 'planejamento' CHECK (status IN ('planejamento','em_andamento','pausada','concluida','cancelada')),
  responsible_name text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE TABLE public.project_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  responsible_name text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE TABLE public.project_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 180),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','cancelado')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'recebido' AND paid_at IS NOT NULL) OR (status <> 'recebido' AND paid_at IS NULL))
);
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  service_name text NOT NULL,
  environment text NOT NULL CHECK (length(trim(environment)) BETWEEN 1 AND 180),
  billing_unit text NOT NULL CHECK (billing_unit IN ('m2','linear','unit','day','project','quote')),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_created_idx ON public.projects(user_id,created_at DESC);
CREATE INDEX projects_company_status_idx ON public.projects(company_id,status);
CREATE INDEX stages_project_idx ON public.project_stages(project_id);
CREATE INDEX payments_project_status_idx ON public.project_payments(project_id,status,due_date);
CREATE INDEX quote_items_quote_idx ON public.quote_items(quote_id);

CREATE TABLE public.quote_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  actor_id uuid,
  old_status public.quote_status NOT NULL,
  new_status public.quote_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_history_quote_idx ON public.quote_status_history(quote_id,created_at DESC);
ALTER TABLE public.quote_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own quote history" ON public.quote_status_history FOR SELECT TO authenticated USING
  (EXISTS(SELECT 1 FROM public.quotes q WHERE q.id=quote_id AND (q.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
GRANT SELECT ON public.quote_status_history TO authenticated;
CREATE FUNCTION public.record_quote_status_change() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.quote_status_history(quote_id,actor_id,old_status,new_status)
    VALUES(NEW.id,auth.uid(),OLD.status,NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_status_history AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.record_quote_status_change();
CREATE FUNCTION public.recalculate_quote_items_total() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.quote_id,OLD.quote_id);
  UPDATE public.quotes SET estimated_total=COALESCE((SELECT sum(quantity*unit_price) FROM public.quote_items WHERE quote_id=target),0) WHERE id=target;
  IF TG_OP='UPDATE' AND OLD.quote_id IS DISTINCT FROM NEW.quote_id THEN
    UPDATE public.quotes SET estimated_total=COALESCE((SELECT sum(quantity*unit_price) FROM public.quote_items WHERE quote_id=OLD.quote_id),0) WHERE id=OLD.quote_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER quote_items_total AFTER INSERT OR UPDATE OR DELETE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.recalculate_quote_items_total();
REVOKE ALL ON FUNCTION public.record_quote_status_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recalculate_quote_items_total() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.project_from_approved_quote() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO source FROM public.quotes WHERE id = NEW.quote_id FOR SHARE;
  IF NOT FOUND OR source.status::text <> 'aprovado' THEN
    RAISE EXCEPTION 'A obra exige um orçamento aprovado';
  END IF;
  NEW.user_id := source.user_id;
  NEW.total_amount := source.estimated_total;
  SELECT parent_company_id INTO NEW.company_id FROM public.profiles WHERE id = source.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_source BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.project_from_approved_quote();
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.recalculate_project_progress() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.project_id,OLD.project_id);
  UPDATE public.projects SET progress = COALESCE((SELECT avg(progress) FROM public.project_stages WHERE project_id=target),0) WHERE id=target;
  IF TG_OP='UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    UPDATE public.projects SET progress = COALESCE((SELECT avg(progress) FROM public.project_stages WHERE project_id=OLD.project_id),0) WHERE id=OLD.project_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER stages_progress AFTER INSERT OR UPDATE OR DELETE ON public.project_stages FOR EACH ROW EXECUTE FUNCTION public.recalculate_project_progress();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own projects" ON public.projects FOR SELECT TO authenticated USING
  (user_id=auth.uid() OR company_id=auth.uid());
CREATE POLICY "Admin stages" ON public.project_stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own project stages" ON public.project_stages FOR SELECT TO authenticated USING
  (EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND (p.user_id=auth.uid() OR p.company_id=auth.uid())));
CREATE POLICY "Admin project payments" ON public.project_payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own project payments" ON public.project_payments FOR SELECT TO authenticated USING
  (EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND (p.user_id=auth.uid() OR p.company_id=auth.uid())));
CREATE POLICY "View own quote items" ON public.quote_items FOR SELECT TO authenticated USING
  (EXISTS(SELECT 1 FROM public.quotes q WHERE q.id=quote_id AND (q.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "Admin quote items" ON public.quote_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.projects,public.project_stages,public.project_payments,public.quote_items TO authenticated;
REVOKE ALL ON FUNCTION public.project_from_approved_quote() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recalculate_project_progress() FROM PUBLIC,anon,authenticated;
COMMIT;
