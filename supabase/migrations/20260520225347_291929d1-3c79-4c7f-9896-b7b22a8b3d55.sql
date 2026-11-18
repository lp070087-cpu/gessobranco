
CREATE TYPE public.appointment_status AS ENUM (
  'aguardando_confirmacao', 'confirmado', 'a_caminho', 'realizada', 'cancelada'
);

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  service_name TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT,
  complement TEXT,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  notes TEXT,
  professional_name TEXT,
  admin_notes TEXT,
  status public.appointment_status NOT NULL DEFAULT 'aguardando_confirmacao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own appointments" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users delete own appointments" ON public.appointments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_appointments_user_date ON public.appointments(user_id, scheduled_date DESC);
CREATE INDEX idx_appointments_date_status ON public.appointments(scheduled_date, status);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Media table (paths to storage objects)
CREATE TABLE public.appointment_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own media" ON public.appointment_media FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert own media" ON public.appointment_media FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own media" ON public.appointment_media FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Storage bucket (public read; uploads gated by user folder)
INSERT INTO storage.buckets (id, name, public) VALUES ('appointment-media', 'appointment-media', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Appointment media public read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'appointment-media');
CREATE POLICY "Users upload own appointment media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'appointment-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own appointment media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'appointment-media' AND auth.uid()::text = (storage.foldername(name))[1]);
