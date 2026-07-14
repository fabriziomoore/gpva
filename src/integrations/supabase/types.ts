export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          last_seen_at: string
          session_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          session_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          last_seen_at?: string
          session_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_reports: {
        Row: {
          counts: Json
          created_at: string
          duration_ms: number
          id: string
          overall_score: number
          report: Json
        }
        Insert: {
          counts?: Json
          created_at?: string
          duration_ms?: number
          id?: string
          overall_score?: number
          report?: Json
        }
        Update: {
          counts?: Json
          created_at?: string
          duration_ms?: number
          id?: string
          overall_score?: number
          report?: Json
        }
        Relationships: []
      }
      catalog_order: {
        Row: {
          catalog: string
          item_ids: string[]
          team_id: string
          updated_at: string
        }
        Insert: {
          catalog: string
          item_ids?: string[]
          team_id: string
          updated_at?: string
        }
        Update: {
          catalog?: string
          item_ids?: string[]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_order_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      complementos_servico: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          team_id?: string | null
        }
        Relationships: []
      }
      equipes: {
        Row: {
          collaborator1: string | null
          collaborator2: string | null
          created_at: string
          id: string
          is_test: boolean
          leader: string
          onboarded: boolean
          photo_url: string | null
          setor_id: string
          supervisor: string
          team_name: string
          variable_rate: number
        }
        Insert: {
          collaborator1?: string | null
          collaborator2?: string | null
          created_at?: string
          id: string
          is_test?: boolean
          leader?: string
          onboarded?: boolean
          photo_url?: string | null
          setor_id: string
          supervisor?: string
          team_name: string
          variable_rate?: number
        }
        Update: {
          collaborator1?: string | null
          collaborator2?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          leader?: string
          onboarded?: boolean
          photo_url?: string | null
          setor_id?: string
          supervisor?: string
          team_name?: string
          variable_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      expedientes: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          report_text: string | null
          started_at: string
          status: string
          team_id: string
          variable_rate_snapshot: number | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          report_text?: string | null
          started_at?: string
          status?: string
          team_id: string
          variable_rate_snapshot?: number | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          report_text?: string | null
          started_at?: string
          status?: string
          team_id?: string
          variable_rate_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      google_form_settings: {
        Row: {
          id: string
          mode: string
          prod_entries: Json
          prod_form_id: string
          test_entries: Json
          test_form_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          mode?: string
          prod_entries?: Json
          prod_form_id?: string
          test_entries?: Json
          test_form_id?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mode?: string
          prod_entries?: Json
          prod_form_id?: string
          test_entries?: Json
          test_form_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      impactos: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impacts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      impactos_expediente: {
        Row: {
          id: string
          impact_id: string | null
          impact_name: string
          shift_id: string
          team_id: string
        }
        Insert: {
          id?: string
          impact_id?: string | null
          impact_name: string
          shift_id: string
          team_id: string
        }
        Update: {
          id?: string
          impact_id?: string | null
          impact_name?: string
          shift_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_impacts_impact_id_fkey"
            columns: ["impact_id"]
            isOneToOne: false
            referencedRelation: "impactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_impacts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_impacts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_inviabilidade: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inviability_reasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos: {
        Row: {
          accuracy_m: number | null
          captured_at: string | null
          created_at: string
          id: string
          is_negotiation: boolean
          lat: number | null
          lng: number | null
          negotiated_value: number | null
          reason_id: string | null
          reason_name: string | null
          registration_number: string | null
          service_type_id: string | null
          service_type_name: string
          shift_id: string
          team_id: string
          viable: boolean
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string | null
          created_at?: string
          id?: string
          is_negotiation?: boolean
          lat?: number | null
          lng?: number | null
          negotiated_value?: number | null
          reason_id?: string | null
          reason_name?: string | null
          registration_number?: string | null
          service_type_id?: string | null
          service_type_name: string
          shift_id: string
          team_id: string
          viable?: boolean
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string | null
          created_at?: string
          id?: string
          is_negotiation?: boolean
          lat?: number | null
          lng?: number | null
          negotiated_value?: number | null
          reason_id?: string | null
          reason_name?: string | null
          registration_number?: string | null
          service_type_id?: string | null
          service_type_name?: string
          shift_id?: string
          team_id?: string
          viable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "motivos_inviabilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          created_at: string
          id: string
          nome: string
          supervisor_nome: string
          supervisor_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          supervisor_nome?: string
          supervisor_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          supervisor_nome?: string
          supervisor_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tipos_servico: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_negotiation: boolean
          name: string
          sort_order: number
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_negotiation?: boolean
          name: string
          sort_order?: number
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_negotiation?: boolean
          name?: string
          sort_order?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_types_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vinculos_complementos: {
        Row: {
          complement_id: string | null
          complement_name: string
          created_at: string
          id: string
          service_id: string
          shift_id: string
          team_id: string
        }
        Insert: {
          complement_id?: string | null
          complement_name: string
          created_at?: string
          id?: string
          service_id: string
          shift_id: string
          team_id: string
        }
        Update: {
          complement_id?: string | null
          complement_name?: string
          created_at?: string
          id?: string
          service_id?: string
          shift_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_complement_links_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_user_ids: { Args: never; Returns: string[] }
      audit_schema_snapshot: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "leader" | "admin" | "supervisor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["leader", "admin", "supervisor"],
    },
  },
} as const
