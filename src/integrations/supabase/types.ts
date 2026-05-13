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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          briefing: string | null
          briefing_read_at: string | null
          briefing_read_by: string | null
          cancellation_reason: string | null
          channel_type: string | null
          closer_handoff_at: string | null
          closer_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          duration_minutes: number
          google_event_id: string | null
          id: string
          is_5k: boolean
          lead_name: string
          lead_phone: string
          meet_link: string | null
          meeting_reason: string | null
          observation: string | null
          original_agendamento_id: string | null
          scheduled_date: string
          scheduled_time: string
          sdr_handoff_at: string | null
          sdr_responsavel_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          briefing?: string | null
          briefing_read_at?: string | null
          briefing_read_by?: string | null
          cancellation_reason?: string | null
          channel_type?: string | null
          closer_handoff_at?: string | null
          closer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          duration_minutes?: number
          google_event_id?: string | null
          id?: string
          is_5k?: boolean
          lead_name: string
          lead_phone: string
          meet_link?: string | null
          meeting_reason?: string | null
          observation?: string | null
          original_agendamento_id?: string | null
          scheduled_date: string
          scheduled_time: string
          sdr_handoff_at?: string | null
          sdr_responsavel_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          briefing?: string | null
          briefing_read_at?: string | null
          briefing_read_by?: string | null
          cancellation_reason?: string | null
          channel_type?: string | null
          closer_handoff_at?: string | null
          closer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          duration_minutes?: number
          google_event_id?: string | null
          id?: string
          is_5k?: boolean
          lead_name?: string
          lead_phone?: string
          meet_link?: string | null
          meeting_reason?: string | null
          observation?: string | null
          original_agendamento_id?: string | null
          scheduled_date?: string
          scheduled_time?: string
          sdr_handoff_at?: string | null
          sdr_responsavel_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_original_agendamento_id_fkey"
            columns: ["original_agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      closer_blocks: {
        Row: {
          block_date: string
          block_type: string
          closer_id: string
          created_at: string
          description: string | null
          end_time: string
          id: string
          is_recurring: boolean
          recurrence_weekday: number | null
          start_time: string
        }
        Insert: {
          block_date: string
          block_type?: string
          closer_id: string
          created_at?: string
          description?: string | null
          end_time: string
          id?: string
          is_recurring?: boolean
          recurrence_weekday?: number | null
          start_time: string
        }
        Update: {
          block_date?: string
          block_type?: string
          closer_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          id?: string
          is_recurring?: boolean
          recurrence_weekday?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_blocks_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_google_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          closer_id: string
          created_at: string
          id: string
          refresh_token: string
          token_expiry: string
          updated_at: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          closer_id: string
          created_at?: string
          id?: string
          refresh_token: string
          token_expiry: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          closer_id?: string
          created_at?: string
          id?: string
          refresh_token?: string
          token_expiry?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_google_tokens_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: true
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closers: {
        Row: {
          active: boolean
          business_hours_end: string
          business_hours_ranges: Json | null
          business_hours_start: string
          created_at: string
          datacrazy_id: string | null
          email: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          business_hours_end?: string
          business_hours_ranges?: Json | null
          business_hours_start?: string
          created_at?: string
          datacrazy_id?: string | null
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          business_hours_end?: string
          business_hours_ranges?: Json | null
          business_hours_start?: string
          created_at?: string
          datacrazy_id?: string | null
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_metrics: {
        Row: {
          classificacao: string | null
          created_at: string
          data_referencia: string
          enviado_em: string | null
          evento: string
          faturamento: string | null
          id: string
          lead_email: string | null
          lead_nome: string | null
          lead_telefone: string | null
          leads_finalizados: number
          leads_iniciados: number
          origem: string
          periodo: string | null
          raw_payload: Json
          received_at: string
          renda: string | null
          taxa_conclusao: number | null
          tem_empresa: boolean | null
        }
        Insert: {
          classificacao?: string | null
          created_at?: string
          data_referencia: string
          enviado_em?: string | null
          evento: string
          faturamento?: string | null
          id?: string
          lead_email?: string | null
          lead_nome?: string | null
          lead_telefone?: string | null
          leads_finalizados?: number
          leads_iniciados?: number
          origem: string
          periodo?: string | null
          raw_payload?: Json
          received_at?: string
          renda?: string | null
          taxa_conclusao?: number | null
          tem_empresa?: boolean | null
        }
        Update: {
          classificacao?: string | null
          created_at?: string
          data_referencia?: string
          enviado_em?: string | null
          evento?: string
          faturamento?: string | null
          id?: string
          lead_email?: string | null
          lead_nome?: string | null
          lead_telefone?: string | null
          leads_finalizados?: number
          leads_iniciados?: number
          origem?: string
          periodo?: string | null
          raw_payload?: Json
          received_at?: string
          renda?: string | null
          taxa_conclusao?: number | null
          tem_empresa?: boolean | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          cliente_nome: string
          cliente_telefone: string | null
          closer_id: string | null
          created_at: string
          created_by: string
          data_pagamento: string | null
          data_prevista: string
          id: string
          is_hot: boolean
          metodo: string | null
          observacoes: string | null
          status: string
          updated_at: string
          updated_by: string | null
          valor_apresentado: number | null
          valor_previsto: number
          valor_realizado: number | null
          venda_id: string | null
        }
        Insert: {
          agendamento_id?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          closer_id?: string | null
          created_at?: string
          created_by: string
          data_pagamento?: string | null
          data_prevista: string
          id?: string
          is_hot?: boolean
          metodo?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          valor_apresentado?: number | null
          valor_previsto?: number
          valor_realizado?: number | null
          venda_id?: string | null
        }
        Update: {
          agendamento_id?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          closer_id?: string | null
          created_at?: string
          created_by?: string
          data_pagamento?: string | null
          data_prevista?: string
          id?: string
          is_hot?: boolean
          metodo?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          valor_apresentado?: number | null
          valor_previsto?: number
          valor_realizado?: number | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          available_for_scheduling: boolean
          created_at: string
          datacrazy_id: string | null
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          available_for_scheduling?: boolean
          created_at?: string
          datacrazy_id?: string | null
          email: string
          full_name: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          available_for_scheduling?: boolean
          created_at?: string
          datacrazy_id?: string | null
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          allowed: boolean
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          agendamento_id: string | null
          assigned_closer_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          assigned_closer_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          assigned_closer_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_closer_id_fkey"
            columns: ["assigned_closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas: {
        Row: {
          agendamento_id: string
          created_at: string
          created_by: string
          explicacao_nao_fechamento: string | null
          follow_up: boolean
          follow_up_date: string | null
          follow_up_time: string | null
          id: string
          lead_revenue: string | null
          motivo_nao_fechamento: string | null
          observacoes: string | null
          resumo_venda: string | null
          sdr_error: boolean
          updated_at: string
          valor: number | null
          vendeu: boolean
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          created_by: string
          explicacao_nao_fechamento?: string | null
          follow_up?: boolean
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: string
          lead_revenue?: string | null
          motivo_nao_fechamento?: string | null
          observacoes?: string | null
          resumo_venda?: string | null
          sdr_error?: boolean
          updated_at?: string
          valor?: number | null
          vendeu: boolean
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          created_by?: string
          explicacao_nao_fechamento?: string | null
          follow_up?: boolean
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: string
          lead_revenue?: string | null
          motivo_nao_fechamento?: string | null
          observacoes?: string | null
          resumo_venda?: string | null
          sdr_error?: boolean
          updated_at?: string
          valor?: number | null
          vendeu?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vendas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_profiles: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "sdr" | "gestor" | "closer" | "moderador"
      appointment_status:
        | "pendente"
        | "confirmada"
        | "realizada"
        | "cancelada"
        | "reagendada"
        | "no_show"
        | "nao_confirmada"
        | "agendada"
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
      app_role: ["sdr", "gestor", "closer", "moderador"],
      appointment_status: [
        "pendente",
        "confirmada",
        "realizada",
        "cancelada",
        "reagendada",
        "no_show",
        "nao_confirmada",
        "agendada",
      ],
    },
  },
} as const
