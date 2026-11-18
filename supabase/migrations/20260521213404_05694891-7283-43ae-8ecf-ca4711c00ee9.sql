
-- Branding columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_profiles_slug ON public.profiles(slug);

-- Allow public read of basic profile info for landing pages (slug-based)
DROP POLICY IF EXISTS "Public can view branded profiles" ON public.profiles;
CREATE POLICY "Public can view branded profiles"
ON public.profiles FOR SELECT TO anon
USING (slug IS NOT NULL);

-- Gallery items
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  before_url text,
  after_url text,
  video_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gallery public select active"
ON public.gallery_items FOR SELECT TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Gallery owner manage"
ON public.gallery_items FOR ALL TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

-- Page visits (anonymous-friendly insert)
CREATE TABLE IF NOT EXISTS public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  slug text NOT NULL,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert visits"
ON public.page_visits FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Owner views visits"
ON public.page_visits FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_page_visits_owner ON public.page_visits(owner_id, created_at DESC);

-- AI analyses
CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quote_id uuid,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty text NOT NULL DEFAULT 'media',
  detected_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_hours numeric,
  multiplier numeric NOT NULL DEFAULT 1.0,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own analyses"
ON public.ai_analyses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own analyses"
ON public.ai_analyses FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Shares
CREATE TABLE IF NOT EXISTS public.shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manage shares"
ON public.shares FOR ALL TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = owner_id);
