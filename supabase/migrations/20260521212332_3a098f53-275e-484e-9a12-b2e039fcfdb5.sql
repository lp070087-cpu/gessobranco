
-- 1) Extend enums
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'autonomo';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autonomo';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'funcionario';

-- 2) profiles: parent company link
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_company_id uuid;

-- 3) PLANS
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  monthly_price numeric NOT NULL DEFAULT 0,
  audience text NOT NULL DEFAULT 'autonomo',
  max_team integer,
  max_quotes_month integer,
  highlighted boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plans viewable by authenticated" ON public.plans;
CREATE POLICY "Plans viewable by authenticated" ON public.plans
  FOR SELECT TO authenticated USING (is_active = true OR has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage plans" ON public.plans;
CREATE POLICY "Admins manage plans" ON public.plans
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 4) SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'trial',
  payment_method text NOT NULL DEFAULT 'pix',
  current_period_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own subs select" ON public.subscriptions;
CREATE POLICY "Own subs select" ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Own subs insert" ON public.subscriptions;
CREATE POLICY "Own subs insert" ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own subs update" ON public.subscriptions;
CREATE POLICY "Own subs update" ON public.subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Own subs delete" ON public.subscriptions;
CREATE POLICY "Own subs delete" ON public.subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) TEAM MEMBERS
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  full_name text NOT NULL,
  role_title text NOT NULL DEFAULT 'profissional',
  phone text,
  specialties text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team select" ON public.team_members;
CREATE POLICY "Team select" ON public.team_members FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Team insert" ON public.team_members;
CREATE POLICY "Team insert" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Team update" ON public.team_members;
CREATE POLICY "Team update" ON public.team_members FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Team delete" ON public.team_members;
CREATE POLICY "Team delete" ON public.team_members FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_team_updated BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'tinta',
  price numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Products select" ON public.products;
CREATE POLICY "Products select" ON public.products FOR SELECT TO authenticated
  USING (is_active = true OR auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Products insert" ON public.products;
CREATE POLICY "Products insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Products update" ON public.products;
CREATE POLICY "Products update" ON public.products FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Products delete" ON public.products;
CREATE POLICY "Products delete" ON public.products FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) SERVICE REGIONS
CREATE TABLE IF NOT EXISTS public.service_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  city text NOT NULL,
  neighborhood text,
  radius_km integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Regions select" ON public.service_regions;
CREATE POLICY "Regions select" ON public.service_regions FOR SELECT TO authenticated
  USING (is_active = true OR auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Regions insert" ON public.service_regions;
CREATE POLICY "Regions insert" ON public.service_regions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Regions update" ON public.service_regions;
CREATE POLICY "Regions update" ON public.service_regions FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Regions delete" ON public.service_regions;
CREATE POLICY "Regions delete" ON public.service_regions FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));

-- 8) FINANCIAL ENTRIES
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'entrada',
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Fin select" ON public.financial_entries;
CREATE POLICY "Fin select" ON public.financial_entries FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Fin insert" ON public.financial_entries;
CREATE POLICY "Fin insert" ON public.financial_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Fin update" ON public.financial_entries;
CREATE POLICY "Fin update" ON public.financial_entries FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Fin delete" ON public.financial_entries;
CREATE POLICY "Fin delete" ON public.financial_entries FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR has_role(auth.uid(),'admin'));

-- 9) Update handle_new_user to support autonomo role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _account_type public.account_type;
BEGIN
  _account_type := COALESCE((NEW.raw_user_meta_data->>'account_type')::public.account_type, 'cliente');

  INSERT INTO public.profiles (id, email, account_type, full_name, phone, company_name, responsible_name, cnpj)
  VALUES (
    NEW.id, NEW.email, _account_type,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'responsible_name',
    NEW.raw_user_meta_data->>'cnpj'
  );

  IF NEW.email = 'lp070087@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _account_type::text::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 10) Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Product images public read" ON storage.objects;
CREATE POLICY "Product images public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS "Product images owner write" ON storage.objects;
CREATE POLICY "Product images owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Product images owner update" ON storage.objects;
CREATE POLICY "Product images owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Product images owner delete" ON storage.objects;
CREATE POLICY "Product images owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 11) Seed plans
INSERT INTO public.plans (key, name, tagline, monthly_price, audience, max_team, max_quotes_month, highlighted, features, sort_order)
VALUES
  ('autonomo', 'Autônomo', 'Para o profissional independente', 49.90, 'autonomo', 3, 30, false,
    '["Até 3 trabalhadores","Catálogo de serviços","Calculadora ilimitada","Agenda básica","Suporte por e-mail"]'::jsonb, 1),
  ('empresa', 'Empresa', 'Equipe e operação completas', 149.90, 'empresa', 50, 500, true,
    '["Equipe ilimitada (até 50)","Dashboard avançado","Relatórios financeiros","Regiões atendidas","Agenda compartilhada","Suporte prioritário"]'::jsonb, 2),
  ('premium', 'Premium', 'Destaque máximo e IA futura', 299.90, 'empresa', NULL, NULL, false,
    '["Tudo do Empresa","Destaque na home","Prioridade nos clientes","Analytics avançado","IA de recomendação (em breve)"]'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;
