
-- Enum for quote status
CREATE TYPE public.quote_status AS ENUM ('estimado', 'aguardando_visita', 'aprovado', 'finalizado');

-- SERVICES table (admin-managed catalog)
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'acabamento',
  price_per_m2 NUMERIC(10,2) NOT NULL CHECK (price_per_m2 >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active services viewable by authenticated"
  ON public.services FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert services"
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update services"
  ON public.services FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete services"
  ON public.services FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- QUOTES table
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  height NUMERIC(10,2) NOT NULL CHECK (height > 0),
  width NUMERIC(10,2) NOT NULL CHECK (width > 0),
  area NUMERIC(12,2) NOT NULL CHECK (area > 0),
  price_per_m2 NUMERIC(10,2) NOT NULL CHECK (price_per_m2 >= 0),
  estimated_total NUMERIC(12,2) NOT NULL CHECK (estimated_total >= 0),
  notes TEXT,
  photo_url TEXT,
  status public.quote_status NOT NULL DEFAULT 'estimado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own quotes"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own quotes"
  ON public.quotes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own quotes"
  ON public.quotes FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_quotes_user_created ON public.quotes(user_id, created_at DESC);

-- Reuse / create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial services
INSERT INTO public.services (key, name, short_name, description, category, price_per_m2, sort_order) VALUES
('pintura', 'Pintura Elite', 'Pintura', 'Tinta premium com dois demãos e acabamento impecável.', 'acabamento', 45, 1),
('gesso', 'Gesso Liso', 'Gesso', 'Aplicação técnica de gesso para superfícies perfeitamente planas.', 'acabamento', 55, 2),
('parede3d', 'Parede 3D', '3D', 'Transforme ambientes com acabamento moderno e sofisticado.', 'acabamento', 120, 3),
('drywall', 'Drywall', 'Drywall', 'Divisórias rápidas com isolamento acústico e térmico.', 'estrutura', 95, 4),
('massa', 'Massa Corrida', 'Massa', 'Preparação e nivelamento de superfícies para acabamento perfeito.', 'acabamento', 28, 5),
('textura', 'Textura Premium', 'Textura', 'Marmorato, cimento queimado e acabamentos artísticos.', 'acabamento', 65, 6),
('forro', 'Forro Moderno', 'Forro', 'Forros em drywall e PVC com iluminação embutida.', 'estrutura', 110, 7),
('reparos', 'Reparos Express', 'Reparos', 'Reparos rápidos em paredes, trincas e infiltrações.', 'manutencao', 35, 8);

-- Storage bucket for quote photos (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-photos', 'quote-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own quote photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own quote photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own quote photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
