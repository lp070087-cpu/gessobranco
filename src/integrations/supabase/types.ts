export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_logs: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      ai_analyses: {
        Row: {
          created_at: string;
          detected_issues: Json;
          difficulty: string;
          estimated_hours: number | null;
          id: string;
          multiplier: number;
          photo_urls: Json;
          quote_id: string | null;
          suggested_materials: Json;
          summary: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          detected_issues?: Json;
          difficulty?: string;
          estimated_hours?: number | null;
          id?: string;
          multiplier?: number;
          photo_urls?: Json;
          quote_id?: string | null;
          suggested_materials?: Json;
          summary?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          detected_issues?: Json;
          difficulty?: string;
          estimated_hours?: number | null;
          id?: string;
          multiplier?: number;
          photo_urls?: Json;
          quote_id?: string | null;
          suggested_materials?: Json;
          summary?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      appointment_media: {
        Row: {
          appointment_id: string;
          created_at: string;
          id: string;
          kind: string;
          path: string;
          user_id: string;
        };
        Insert: {
          appointment_id: string;
          created_at?: string;
          id?: string;
          kind?: string;
          path: string;
          user_id: string;
        };
        Update: {
          appointment_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_media_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          address: string;
          admin_notes: string | null;
          city: string;
          complement: string | null;
          created_at: string;
          full_name: string;
          id: string;
          notes: string | null;
          phone: string;
          postal_code: string | null;
          professional_name: string | null;
          quote_id: string | null;
          scheduled_date: string;
          scheduled_time: string;
          service_name: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
          user_id: string;
          whatsapp: string | null;
        };
        Insert: {
          address: string;
          admin_notes?: string | null;
          city: string;
          complement?: string | null;
          created_at?: string;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone: string;
          postal_code?: string | null;
          professional_name?: string | null;
          quote_id?: string | null;
          scheduled_date: string;
          scheduled_time: string;
          service_name?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
          user_id: string;
          whatsapp?: string | null;
        };
        Update: {
          address?: string;
          admin_notes?: string | null;
          city?: string;
          complement?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone?: string;
          postal_code?: string | null;
          professional_name?: string | null;
          quote_id?: string | null;
          scheduled_date?: string;
          scheduled_time?: string;
          service_name?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
          user_id?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_entries: {
        Row: {
          amount: number;
          created_at: string;
          description: string;
          entry_date: string;
          id: string;
          kind: string;
          owner_id: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          description?: string;
          entry_date?: string;
          id?: string;
          kind?: string;
          owner_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string;
          entry_date?: string;
          id?: string;
          kind?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      gallery_items: {
        Row: {
          after_url: string | null;
          before_url: string | null;
          created_at: string;
          description: string;
          id: string;
          is_active: boolean;
          owner_id: string;
          title: string;
          video_url: string | null;
        };
        Insert: {
          after_url?: string | null;
          before_url?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          owner_id: string;
          title?: string;
          video_url?: string | null;
        };
        Update: {
          after_url?: string | null;
          before_url?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          owner_id?: string;
          title?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          message: string;
          read: boolean;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          message: string;
          read?: boolean;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          message?: string;
          read?: boolean;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      page_visits: {
        Row: {
          created_at: string;
          id: string;
          owner_id: string;
          referrer: string | null;
          slug: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          owner_id: string;
          referrer?: string | null;
          slug: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          owner_id?: string;
          referrer?: string | null;
          slug?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          audience: string;
          created_at: string;
          features: Json;
          highlighted: boolean;
          id: string;
          is_active: boolean;
          key: string;
          max_quotes_month: number | null;
          max_team: number | null;
          monthly_price: number;
          name: string;
          sort_order: number;
          tagline: string;
        };
        Insert: {
          audience?: string;
          created_at?: string;
          features?: Json;
          highlighted?: boolean;
          id?: string;
          is_active?: boolean;
          key: string;
          max_quotes_month?: number | null;
          max_team?: number | null;
          monthly_price?: number;
          name: string;
          sort_order?: number;
          tagline?: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          features?: Json;
          highlighted?: boolean;
          id?: string;
          is_active?: boolean;
          key?: string;
          max_quotes_month?: number | null;
          max_team?: number | null;
          monthly_price?: number;
          name?: string;
          sort_order?: number;
          tagline?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          category: string;
          created_at: string;
          description: string;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          owner_id: string;
          price: number;
          stock: number;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          owner_id: string;
          price?: number;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          owner_id?: string;
          price?: number;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"];
          blocked: boolean;
          brand_color: string | null;
          cnpj: string | null;
          company_name: string | null;
          company_status: Database["public"]["Enums"]["company_status"];
          created_at: string;
          description: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          logo_url: string | null;
          parent_company_id: string | null;
          phone: string | null;
          responsible_name: string | null;
          slug: string | null;
          tagline: string | null;
          updated_at: string;
        };
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"];
          blocked?: boolean;
          brand_color?: string | null;
          cnpj?: string | null;
          company_name?: string | null;
          company_status?: Database["public"]["Enums"]["company_status"];
          created_at?: string;
          description?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          logo_url?: string | null;
          parent_company_id?: string | null;
          phone?: string | null;
          responsible_name?: string | null;
          slug?: string | null;
          tagline?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"];
          blocked?: boolean;
          brand_color?: string | null;
          cnpj?: string | null;
          company_name?: string | null;
          company_status?: Database["public"]["Enums"]["company_status"];
          created_at?: string;
          description?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          logo_url?: string | null;
          parent_company_id?: string | null;
          phone?: string | null;
          responsible_name?: string | null;
          slug?: string | null;
          tagline?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          area: number;
          created_at: string;
          estimated_total: number;
          height: number;
          id: string;
          notes: string | null;
          photo_url: string | null;
          price_per_m2: number;
          service_id: string | null;
          service_name: string;
          status: Database["public"]["Enums"]["quote_status"];
          updated_at: string;
          user_id: string;
          width: number;
        };
        Insert: {
          area: number;
          created_at?: string;
          estimated_total: number;
          height: number;
          id?: string;
          notes?: string | null;
          photo_url?: string | null;
          price_per_m2: number;
          service_id?: string | null;
          service_name: string;
          status?: Database["public"]["Enums"]["quote_status"];
          updated_at?: string;
          user_id: string;
          width: number;
        };
        Update: {
          area?: number;
          created_at?: string;
          estimated_total?: number;
          height?: number;
          id?: string;
          notes?: string | null;
          photo_url?: string | null;
          price_per_m2?: number;
          service_id?: string | null;
          service_name?: string;
          status?: Database["public"]["Enums"]["quote_status"];
          updated_at?: string;
          user_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      ratings: {
        Row: {
          appointment_id: string | null;
          comment: string | null;
          company_id: string | null;
          created_at: string;
          id: string;
          punctuality_score: number;
          quality_score: number;
          service_score: number;
          user_id: string;
        };
        Insert: {
          appointment_id?: string | null;
          comment?: string | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          punctuality_score: number;
          quality_score: number;
          service_score: number;
          user_id: string;
        };
        Update: {
          appointment_id?: string | null;
          comment?: string | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          punctuality_score?: number;
          quality_score?: number;
          service_score?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ratings_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      service_regions: {
        Row: {
          city: string;
          created_at: string;
          id: string;
          is_active: boolean;
          neighborhood: string | null;
          owner_id: string;
          radius_km: number;
        };
        Insert: {
          city: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          neighborhood?: string | null;
          owner_id: string;
          radius_km?: number;
        };
        Update: {
          city?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          neighborhood?: string | null;
          owner_id?: string;
          radius_km?: number;
        };
        Relationships: [];
      };
      services: {
        Row: {
          category: string;
          created_at: string;
          description: string;
          id: string;
          image_url: string | null;
          is_active: boolean;
          key: string;
          name: string;
          price_per_m2: number;
          short_name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          key: string;
          name: string;
          price_per_m2: number;
          short_name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          key?: string;
          name?: string;
          price_per_m2?: number;
          short_name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shares: {
        Row: {
          channel: string;
          created_at: string;
          id: string;
          owner_id: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          id?: string;
          owner_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          payment_method: string;
          plan_id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          payment_method?: string;
          plan_id: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          payment_method?: string;
          plan_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          owner_id: string;
          phone: string | null;
          role_title: string;
          specialties: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          owner_id: string;
          phone?: string | null;
          role_title?: string;
          specialties?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          owner_id?: string;
          phone?: string | null;
          role_title?: string;
          specialties?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      account_type: "cliente" | "empresa" | "autonomo";
      app_role: "admin" | "cliente" | "empresa" | "autonomo" | "gerente" | "funcionario";
      appointment_status:
        "aguardando_confirmacao" | "confirmado" | "a_caminho" | "realizada" | "cancelada";
      company_status: "pendente" | "aprovada" | "bloqueada";
      quote_status:
        | "estimado"
        | "aguardando_visita"
        | "aprovado"
        | "finalizado"
        | "em_analise"
        | "enviado"
        | "rejeitado"
        | "cancelado"
        | "em_execucao";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_type: ["cliente", "empresa", "autonomo"],
      app_role: ["admin", "cliente", "empresa", "autonomo", "gerente", "funcionario"],
      appointment_status: [
        "aguardando_confirmacao",
        "confirmado",
        "a_caminho",
        "realizada",
        "cancelada",
      ],
      company_status: ["pendente", "aprovada", "bloqueada"],
      quote_status: ["estimado", "aguardando_visita", "aprovado", "finalizado"],
    },
  },
} as const;
