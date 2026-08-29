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
        Relationships: []
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
          deleted_at: string | null
          id: string
          name: string
          sort_order: number
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          sort_order?: number
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
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
          leader_id: string | null
          onboarded: boolean
          photo_url: string | null
          setor_id: string
          supervisor: string
          supervisor_id: string | null
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
          leader_id?: string | null
          onboarded?: boolean
          photo_url?: string | null
          setor_id: string
          supervisor?: string
          supervisor_id?: string | null
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
          leader_id?: string | null
          onboarded?: boolean
          photo_url?: string | null
          setor_id?: string
          supervisor?: string
          supervisor_id?: string | null
          team_name?: string
          variable_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipes_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "lideres_estrutura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisores"
            referencedColumns: ["id"]
          },
        ]
      }
      expedientes: {
        Row: {
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          deleted_at: string | null
          id: string
          impact_id: string | null
          impact_name: string
          shift_id: string
          team_id: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          impact_id?: string | null
          impact_name: string
          shift_id: string
          team_id: string
        }
        Update: {
          deleted_at?: string | null
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
      lideres_estrutura: {
        Row: {
          created_at: string
          id: string
          nome: string
          setor_id: string
          supervisor_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          setor_id: string
          supervisor_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          setor_id?: string
          supervisor_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lideres_estrutura_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lideres_estrutura_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisores"
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
      procedimento_versoes: {
        Row: {
          arvore_decisao: Json
          categoria: string
          created_at: string | null
          criado_por_id: string
          descricao: string | null
          fonte: string | null
          id: string
          procedimento_id: string
          publicado_por_id: string | null
          published_at: string | null
          setor: string | null
          status: Database["public"]["Enums"]["procedimento_status"]
          status_alterado_por_id: string | null
          status_updated_at: string | null
          substitui_versao_id: string | null
          titulo: string
          updated_at: string | null
          versao: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          arvore_decisao: Json
          categoria: string
          created_at?: string | null
          criado_por_id: string
          descricao?: string | null
          fonte?: string | null
          id?: string
          procedimento_id: string
          publicado_por_id?: string | null
          published_at?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["procedimento_status"]
          status_alterado_por_id?: string | null
          status_updated_at?: string | null
          substitui_versao_id?: string | null
          titulo: string
          updated_at?: string | null
          versao: number
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          arvore_decisao?: Json
          categoria?: string
          created_at?: string | null
          criado_por_id?: string
          descricao?: string | null
          fonte?: string | null
          id?: string
          procedimento_id?: string
          publicado_por_id?: string | null
          published_at?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["procedimento_status"]
          status_alterado_por_id?: string | null
          status_updated_at?: string | null
          substitui_versao_id?: string | null
          titulo?: string
          updated_at?: string | null
          versao?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_versoes_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_versoes_substitui_versao_id_fkey"
            columns: ["substitui_versao_id"]
            isOneToOne: false
            referencedRelation: "procedimento_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimentos: {
        Row: {
          created_at: string | null
          id: string
          nome_logico: string
          responsavel_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome_logico: string
          responsavel_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome_logico?: string
          responsavel_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      servicos: {
        Row: {
          accuracy_m: number | null
          captured_at: string | null
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      supervisores: {
        Row: {
          created_at: string
          id: string
          nome: string
          setor_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          setor_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          setor_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
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
          deleted_at: string | null
          id: string
          service_id: string
          shift_id: string
          team_id: string
        }
        Insert: {
          complement_id?: string | null
          complement_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          service_id: string
          shift_id: string
          team_id: string
        }
        Update: {
          complement_id?: string | null
          complement_name?: string
          created_at?: string
          deleted_at?: string | null
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
      create_procedure_with_version: {
        Args: {
          p_arvore_decisao: Json
          p_categoria: string
          p_descricao: string
          p_fonte: string
          p_setor: string
          p_titulo: string
          p_vigencia_fim: string
          p_vigencia_inicio: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      operational_visible_team_ids: { Args: never; Returns: string[] }
      publish_procedure_version: {
        Args: {
          p_substitui_versao_id?: string
          p_versao_id: string
          p_vigencia_inicio: string
        }
        Returns: string
      }
      reset_current_demo_session: { Args: never; Returns: Json }
      validate_procedure_tree: { Args: { p_tree: Json }; Returns: boolean }
    }
    Enums: {
      app_role: "leader" | "admin" | "supervisor"
      procedimento_status: "draft" | "published" | "suspended" | "archived"
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
      procedimento_status: ["draft", "published", "suspended", "archived"],
    },
  },
} as const
