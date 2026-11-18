
-- Company status enum
DO $$ BEGIN
  CREATE TYPE public.company_status AS ENUM ('pendente', 'aprovada', 'bloqueada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_status public.company_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- Ratings table
CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  company_id uuid,
  service_score smallint NOT NULL CHECK (service_score BETWEEN 1 AND 5),
  quality_score smallint NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
  punctuality_score smallint NOT NULL CHECK (punctuality_score BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own ratings" ON public.ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own or admins all" ON public.ratings
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ratings" ON public.ratings
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  kind text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR auth.uid() = user_id);
CREATE POLICY "Admins delete notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- Admin logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage logs" ON public.admin_logs
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Allow admins to view all profiles already via existing policy; add delete for admin
CREATE POLICY "Admins delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
