import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Operational tables are introduced by the additive migration. Access still uses
// the current authenticated client and database RLS; no service key is exposed.
export const adminDb = supabase as SupabaseClient;

export const BILLING_UNITS = {
  m2: "m²",
  linear: "Metro linear",
  unit: "Unidade",
  day: "Diária",
  project: "Projeto",
  quote: "Sob orçamento",
} as const;
