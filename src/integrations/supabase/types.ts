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
      impacts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          team_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          team_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impacts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      inviability_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          team_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          team_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inviability_reasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_negotiation: boolean
          name: string
          sort_order: number
          team_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_negotiation?: boolean
          name: string
          sort_order?: number
          team_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_negotiation?: boolean
          name?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          id: string
          is_negotiation: boolean
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
          created_at?: string
          id?: string
          is_negotiation?: boolean
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
          created_at?: string
          id?: string
          is_negotiation?: boolean
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
            referencedRelation: "inviability_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_impacts: {
        Row: {
          impact_id: string
          impact_name: string
          shift_id: string
          team_id: string
        }
        Insert: {
          impact_id: string
          impact_name: string
          shift_id: string
          team_id: string
        }
        Update: {
          impact_id?: string
          impact_name?: string
          shift_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_impacts_impact_id_fkey"
            columns: ["impact_id"]
            isOneToOne: false
            referencedRelation: "impacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_impacts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_impacts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
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
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          leader: string
          onboarded: boolean
          supervisor: string
          team_name: string
          variable_rate: number
        }
        Insert: {
          created_at?: string
          id: string
          leader?: string
          onboarded?: boolean
          supervisor?: string
          team_name: string
          variable_rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          leader?: string
          onboarded?: boolean
          supervisor?: string
          team_name?: string
          variable_rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
