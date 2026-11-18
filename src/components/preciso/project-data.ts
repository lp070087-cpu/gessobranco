// Typed adapter for the existing project tables, pending the legacy data migration to Neon.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type ProjectRow = {
  id: string;
  quote_id: string;
  user_id: string;
  company_id: string | null;
  title: string;
  kind: string;
  status: string;
  responsible_name: string;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  total_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
};
type StageRow = {
  id: string;
  project_id: string;
  title: string;
  responsible_name: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};
type PaymentRow = {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
};
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type ProjectDatabase = {
  public: {
    Tables: {
      projects: Table<ProjectRow>;
      project_stages: Table<StageRow>;
      project_payments: Table<PaymentRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
export const projectDatabase = supabase as unknown as SupabaseClient<ProjectDatabase>;
