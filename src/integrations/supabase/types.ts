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
      agendamentos: {
        Row: {
          booking_channel: string | null
          briefing: string | null
          briefing_read_at: string | null
          briefing_read_by: string | null
          cancellation_reason: string | null
          channel_type: string | null
          client_ip_address: string | null
          client_user_agent: string | null
          closer_handoff_at: string | null
          closer_id: string | null
          closer_return_reason: string | null
          closer_returned_at: string | null
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          duration_minutes: number
          fbc: string | null
          fbp: string | null
          google_event_id: string | null
          id: string
          idempotency_key: string | null
          is_5k: boolean
          is_venda_avulsa: boolean
          lead_email: string | null
          lead_name: string
          lead_phone: string
          lead_state: string | null
          lembrete_video_enviado: string | null
          meet_link: string | null
          meeting_reason: string | null
          meta_lead_id: string | null
          observation: string | null
          original_agendamento_id: string | null
          scheduled_date: string
          scheduled_time: string
          sdr_error: boolean
          sdr_error_at: string | null
          sdr_error_by: string | null
          sdr_error_description: string | null
          sdr_error_outcome: string | null
          sdr_error_reviewed_at: string | null
          sdr_error_reviewed_by: string | null
          sdr_handoff_at: string | null
          sdr_responsavel_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          booking_channel?: string | null
          briefing?: string | null
          briefing_read_at?: string | null
          briefing_read_by?: string | null
          cancellation_reason?: string | null
          channel_type?: string | null
          client_ip_address?: string | null
          client_user_agent?: string | null
          closer_handoff_at?: string | null
          closer_id?: string | null
          closer_return_reason?: string | null
          closer_returned_at?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          duration_minutes?: number
          fbc?: string | null
          fbp?: string | null
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_5k?: boolean
          is_venda_avulsa?: boolean
          lead_email?: string | null
          lead_name: string
          lead_phone: string
          lead_state?: string | null
          lembrete_video_enviado?: string | null
          meet_link?: string | null
          meeting_reason?: string | null
          meta_lead_id?: string | null
          observation?: string | null
          original_agendamento_id?: string | null
          scheduled_date: string
          scheduled_time: string
          sdr_error?: boolean
          sdr_error_at?: string | null
          sdr_error_by?: string | null
          sdr_error_description?: string | null
          sdr_error_outcome?: string | null
          sdr_error_reviewed_at?: string | null
          sdr_error_reviewed_by?: string | null
          sdr_handoff_at?: string | null
          sdr_responsavel_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          booking_channel?: string | null
          briefing?: string | null
          briefing_read_at?: string | null
          briefing_read_by?: string | null
          cancellation_reason?: string | null
          channel_type?: string | null
          client_ip_address?: string | null
          client_user_agent?: string | null
          closer_handoff_at?: string | null
          closer_id?: string | null
          closer_return_reason?: string | null
          closer_returned_at?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          duration_minutes?: number
          fbc?: string | null
          fbp?: string | null
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_5k?: boolean
          is_venda_avulsa?: boolean
          lead_email?: string | null
          lead_name?: string
          lead_phone?: string
          lead_state?: string | null
          lembrete_video_enviado?: string | null
          meet_link?: string | null
          meeting_reason?: string | null
          meta_lead_id?: string | null
          observation?: string | null
          original_agendamento_id?: string | null
          scheduled_date?: string
          scheduled_time?: string
          sdr_error?: boolean
          sdr_error_at?: string | null
          sdr_error_by?: string | null
          sdr_error_description?: string | null
          sdr_error_outcome?: string | null
          sdr_error_reviewed_at?: string | null
          sdr_error_reviewed_by?: string | null
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
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
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
          user_email: string | null
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
          user_email?: string | null
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
          user_email?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      chamadas: {
        Row: {
          agendamento_id: string | null
          answered_at: string | null
          audit_log_id: string | null
          called_by: string
          caller_extension: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          lead_name: string | null
          lead_phone: string
          provider: string
          provider_call_id: string | null
          raw_payload: Json | null
          started_at: string
          status: string
          status_code: string | null
          status_label: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          answered_at?: string | null
          audit_log_id?: string | null
          called_by: string
          caller_extension?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_name?: string | null
          lead_phone: string
          provider?: string
          provider_call_id?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string
          status_code?: string | null
          status_label?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          answered_at?: string | null
          audit_log_id?: string | null
          called_by?: string
          caller_extension?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_name?: string | null
          lead_phone?: string
          provider?: string
          provider_call_id?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string
          status_code?: string | null
          status_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamadas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_block_exceptions: {
        Row: {
          block_id: string
          closer_id: string
          created_at: string
          created_by: string | null
          end_time: string
          exception_date: string
          id: string
          start_time: string
        }
        Insert: {
          block_id: string
          closer_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          exception_date: string
          id?: string
          start_time: string
        }
        Update: {
          block_id?: string
          closer_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          exception_date?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_block_exceptions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "closer_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_block_exceptions_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_block_releases: {
        Row: {
          closer_id: string
          created_at: string
          end_time: string
          exception_id: string | null
          id: string
          original_block: Json
          original_block_type: string | null
          original_description: string | null
          release_date: string
          released_by: string | null
          released_by_name: string | null
          start_time: string
          undone_at: string | null
        }
        Insert: {
          closer_id: string
          created_at?: string
          end_time: string
          exception_id?: string | null
          id?: string
          original_block?: Json
          original_block_type?: string | null
          original_description?: string | null
          release_date: string
          released_by?: string | null
          released_by_name?: string | null
          start_time: string
          undone_at?: string | null
        }
        Update: {
          closer_id?: string
          created_at?: string
          end_time?: string
          exception_id?: string | null
          id?: string
          original_block?: Json
          original_block_type?: string | null
          original_description?: string | null
          release_date?: string
          released_by?: string | null
          released_by_name?: string | null
          start_time?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_block_releases_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_block_releases_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "closer_block_exceptions"
            referencedColumns: ["id"]
          },
        ]
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
      closer_error_reviews: {
        Row: {
          agendamento_id: string
          classification: string
          closer_id: string | null
          created_at: string
          error_category: string | null
          error_description: string | null
          feedback_at: string | null
          feedback_by: string | null
          feedback_given: boolean
          feedback_notes: string | null
          id: string
          reviewed_at: string
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id: string
          classification: string
          closer_id?: string | null
          created_at?: string
          error_category?: string | null
          error_description?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          feedback_given?: boolean
          feedback_notes?: string | null
          id?: string
          reviewed_at?: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string
          classification?: string
          closer_id?: string | null
          created_at?: string
          error_category?: string | null
          error_description?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          feedback_given?: boolean
          feedback_notes?: string | null
          id?: string
          reviewed_at?: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_error_reviews_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_error_reviews_closer_id_fkey"
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
          granted_scopes: string | null
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
          granted_scopes?: string | null
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
          granted_scopes?: string | null
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
          auto_recording_enabled: boolean
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
          auto_recording_enabled?: boolean
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
          auto_recording_enabled?: boolean
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
      crm_daily_run_items: {
        Row: {
          agendamento_id: string | null
          attempts: number
          closer_name: string | null
          error: string | null
          id: string
          lead_name: string | null
          lead_phone: string | null
          ok: boolean
          run_date: string
          run_id: string
          sent_at: string
          status_code: number | null
          valor: number | null
          venda_id: string
        }
        Insert: {
          agendamento_id?: string | null
          attempts?: number
          closer_name?: string | null
          error?: string | null
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          ok?: boolean
          run_date: string
          run_id: string
          sent_at?: string
          status_code?: number | null
          valor?: number | null
          venda_id: string
        }
        Update: {
          agendamento_id?: string | null
          attempts?: number
          closer_name?: string | null
          error?: string | null
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          ok?: boolean
          run_date?: string
          run_id?: string
          sent_at?: string
          status_code?: number | null
          valor?: number | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_daily_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crm_daily_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_daily_runs: {
        Row: {
          created_at: string
          error: string | null
          failed: number
          finished_at: string | null
          forced: boolean
          id: string
          kind: string
          lease_until: string | null
          run_date: string
          sent: number
          skipped: number
          started_at: string
          status: string
          total: number
          triggered_by: string | null
          triggered_by_name: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          forced?: boolean
          id?: string
          kind?: string
          lease_until?: string | null
          run_date: string
          sent?: number
          skipped?: number
          started_at?: string
          status?: string
          total?: number
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          forced?: boolean
          id?: string
          kind?: string
          lease_until?: string | null
          run_date?: string
          sent?: number
          skipped?: number
          started_at?: string
          status?: string
          total?: number
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Relationships: []
      }
      lead_ai_analysis: {
        Row: {
          agendamento_id: string
          analysis: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          agendamento_id: string
          analysis: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string
          analysis?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_ai_analysis_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
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
      meta_capi_events: {
        Row: {
          agendamento_id: string | null
          created_at: string
          event_id: string
          event_name: string
          response_body: string | null
          response_code: number | null
          status: string
          updated_at: string
          venda_id: string | null
        }
        Insert: {
          agendamento_id?: string | null
          created_at?: string
          event_id: string
          event_name: string
          response_body?: string | null
          response_code?: number | null
          status?: string
          updated_at?: string
          venda_id?: string | null
        }
        Update: {
          agendamento_id?: string | null
          created_at?: string
          event_id?: string
          event_name?: string
          response_body?: string | null
          response_code?: number | null
          status?: string
          updated_at?: string
          venda_id?: string | null
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
          api4com_extension: string | null
          available_for_scheduling: boolean
          created_at: string
          datacrazy_id: string | null
          email: string
          full_name: string
          id: string
          is_sdr_override: boolean
          moderador_tipo: string | null
          must_change_password: boolean
          sdr_team: Database["public"]["Enums"]["sdr_team"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          api4com_extension?: string | null
          available_for_scheduling?: boolean
          created_at?: string
          datacrazy_id?: string | null
          email: string
          full_name: string
          id?: string
          is_sdr_override?: boolean
          moderador_tipo?: string | null
          must_change_password?: boolean
          sdr_team?: Database["public"]["Enums"]["sdr_team"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          api4com_extension?: string | null
          available_for_scheduling?: boolean
          created_at?: string
          datacrazy_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_sdr_override?: boolean
          moderador_tipo?: string | null
          must_change_password?: boolean
          sdr_team?: Database["public"]["Enums"]["sdr_team"] | null
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
      sdr_config: {
        Row: {
          chave: string
          valor: string
        }
        Insert: {
          chave: string
          valor?: string
        }
        Update: {
          chave?: string
          valor?: string
        }
        Relationships: []
      }
      sdr_conversas: {
        Row: {
          agendamento_id: string | null
          classificacao: string | null
          conversation_id: string
          created_at: string
          dados: Json
          encerrada_motivo: string | null
          etapa: string | null
          followups_enviados: number
          handoff_motivo: string | null
          last_lead_message_at: string | null
          lead_id: string | null
          origem: string | null
          telefone: string | null
          tokens_in: number
          tokens_out: number
          turnos_agente: number
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          classificacao?: string | null
          conversation_id: string
          created_at?: string
          dados?: Json
          encerrada_motivo?: string | null
          etapa?: string | null
          followups_enviados?: number
          handoff_motivo?: string | null
          last_lead_message_at?: string | null
          lead_id?: string | null
          origem?: string | null
          telefone?: string | null
          tokens_in?: number
          tokens_out?: number
          turnos_agente?: number
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          classificacao?: string | null
          conversation_id?: string
          created_at?: string
          dados?: Json
          encerrada_motivo?: string | null
          etapa?: string | null
          followups_enviados?: number
          handoff_motivo?: string | null
          last_lead_message_at?: string | null
          lead_id?: string | null
          origem?: string | null
          telefone?: string | null
          tokens_in?: number
          tokens_out?: number
          turnos_agente?: number
          updated_at?: string
        }
        Relationships: []
      }
      sdr_downsell: {
        Row: {
          clicou_em: string | null
          comprou_em: string | null
          created_at: string
          dados: Json
          email: string | null
          enviado_em: string | null
          etapa: string
          form_at: string | null
          form_id: string | null
          nome: string | null
          oferta_expira_em: string | null
          origem: string
          pagina_vista_em: string | null
          pedido_id: string | null
          respondeu_em: string | null
          telefone: string
          updated_at: string
          utm_content: string | null
        }
        Insert: {
          clicou_em?: string | null
          comprou_em?: string | null
          created_at?: string
          dados?: Json
          email?: string | null
          enviado_em?: string | null
          etapa?: string
          form_at?: string | null
          form_id?: string | null
          nome?: string | null
          oferta_expira_em?: string | null
          origem?: string
          pagina_vista_em?: string | null
          pedido_id?: string | null
          respondeu_em?: string | null
          telefone: string
          updated_at?: string
          utm_content?: string | null
        }
        Update: {
          clicou_em?: string | null
          comprou_em?: string | null
          created_at?: string
          dados?: Json
          email?: string | null
          enviado_em?: string | null
          etapa?: string
          form_at?: string | null
          form_id?: string | null
          nome?: string | null
          oferta_expira_em?: string | null
          origem?: string
          pagina_vista_em?: string | null
          pedido_id?: string | null
          respondeu_em?: string | null
          telefone?: string
          updated_at?: string
          utm_content?: string | null
        }
        Relationships: []
      }
      sdr_downsell_rate_limits: {
        Row: {
          created_at: string
          ip_hash: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          ip_hash: string
          request_count?: number
          window_start: string
        }
        Update: {
          created_at?: string
          ip_hash?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      sdr_exclusoes: {
        Row: {
          created_at: string
          motivo: string | null
          origem: string | null
          telefone: string
        }
        Insert: {
          created_at?: string
          motivo?: string | null
          origem?: string | null
          telefone: string
        }
        Update: {
          created_at?: string
          motivo?: string | null
          origem?: string | null
          telefone?: string
        }
        Relationships: []
      }
      sheets_motivos_exports: {
        Row: {
          created_at: string
          id: string
          month: string
          spreadsheet_id: string
          spreadsheet_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          spreadsheet_id: string
          spreadsheet_url: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          spreadsheet_id?: string
          spreadsheet_url?: string
        }
        Relationships: []
      }
      sheets_motivos_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          lease_until: string | null
          month: string | null
          rows: number
          run_date: string
          sheet_title: string | null
          spreadsheet_url: string | null
          started_at: string
          status: string
          triggered_by: string | null
          triggered_by_name: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          lease_until?: string | null
          month?: string | null
          rows?: number
          run_date: string
          sheet_title?: string | null
          spreadsheet_url?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          lease_until?: string | null
          month?: string | null
          rows?: number
          run_date?: string
          sheet_title?: string | null
          spreadsheet_url?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          triggered_by_name?: string | null
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
      venda_complementos: {
        Row: {
          created_at: string
          criado_por: string
          data_pagamento: string
          id: string
          observacoes: string | null
          updated_at: string
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          criado_por?: string
          data_pagamento: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          data_pagamento?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_complementos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          agendamento_id: string
          closed_at: string | null
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
          order_bumps: Json | null
          produto: string | null
          resumo_venda: string | null
          sdr_error: boolean
          sdr_error_outcome: string | null
          sdr_error_reviewed_at: string | null
          sdr_error_reviewed_by: string | null
          segunda_reuniao: boolean
          status_antes_venda:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          updated_at: string
          valor: number | null
          valor_total_projeto: number | null
          venda_origem: string | null
          vendeu: boolean
          vendeu_closer: boolean | null
        }
        Insert: {
          agendamento_id: string
          closed_at?: string | null
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
          order_bumps?: Json | null
          produto?: string | null
          resumo_venda?: string | null
          sdr_error?: boolean
          sdr_error_outcome?: string | null
          sdr_error_reviewed_at?: string | null
          sdr_error_reviewed_by?: string | null
          segunda_reuniao?: boolean
          status_antes_venda?:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          updated_at?: string
          valor?: number | null
          valor_total_projeto?: number | null
          venda_origem?: string | null
          vendeu: boolean
          vendeu_closer?: boolean | null
        }
        Update: {
          agendamento_id?: string
          closed_at?: string | null
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
          order_bumps?: Json | null
          produto?: string | null
          resumo_venda?: string | null
          sdr_error?: boolean
          sdr_error_outcome?: string | null
          sdr_error_reviewed_at?: string | null
          sdr_error_reviewed_by?: string | null
          segunda_reuniao?: boolean
          status_antes_venda?:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          updated_at?: string
          valor?: number | null
          valor_total_projeto?: number | null
          venda_origem?: string | null
          vendeu?: boolean
          vendeu_closer?: boolean | null
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
      can_toggle_user_active: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      consume_sdr_downsell_rate_limit: {
        Args: { _ip_hash: string }
        Returns: boolean
      }
      current_closer_id: { Args: never; Returns: string }
      dashboard_agendamentos_por_booking_channel: {
        Args: { _base?: string; _from: string; _to: string }
        Returns: {
          channel: string
          ids_created: string[]
          ids_realizada: string[]
          ids_vendas: string[]
          qtd_created: number
          qtd_realizada: number
          qtd_vendas: number
        }[]
      }
      dashboard_agendas_por_canal: {
        Args: { _from: string; _to: string }
        Returns: {
          channel: string
          ids_created: string[]
          ids_created_realizada: string[]
          ids_scheduled: string[]
          ids_scheduled_realizada: string[]
          qtd_created: number
          qtd_created_realizada: number
          qtd_scheduled: number
          qtd_scheduled_realizada: number
        }[]
      }
      dashboard_complementos_periodo: {
        Args: { p_closer_id?: string; p_from: string; p_to: string }
        Returns: {
          qtd: number
          total: number
        }[]
      }
      dashboard_conversao_period: {
        Args: { p_closer_id?: string; p_from: string; p_to: string }
        Returns: {
          ids: string[]
          total_reunioes: number
          total_vendas: number
        }[]
      }
      dashboard_saldo_residual:
        | {
            Args: {
              p_closer_id?: string
              p_limit?: number
              p_offset?: number
              p_order?: string
            }
            Returns: {
              agendamento_id: string
              closed_at: string
              closer_id: string
              closer_name: string
              coletado_acumulado: number
              coletado_base: number
              complementos_total: number
              faturado: number
              is_venda_avulsa: boolean
              lead_name: string
              produto: string
              qtd_complementos: number
              saldo: number
              venda_id: string
            }[]
          }
        | {
            Args: {
              p_closer_id?: string
              p_from?: string
              p_limit?: number
              p_offset?: number
              p_order?: string
            }
            Returns: {
              agendamento_id: string
              closed_at: string
              closer_id: string
              closer_name: string
              coletado_acumulado: number
              coletado_base: number
              complementos_total: number
              faturado: number
              is_venda_avulsa: boolean
              lead_name: string
              produto: string
              qtd_complementos: number
              saldo: number
              venda_id: string
            }[]
          }
      dashboard_saldo_residual_totais:
        | {
            Args: { p_closer_id?: string }
            Returns: {
              qtd_vendas: number
              total_coletado_acumulado: number
              total_faturado: number
              total_saldo: number
            }[]
          }
        | {
            Args: { p_closer_id?: string; p_from?: string }
            Returns: {
              qtd_vendas: number
              total_coletado_acumulado: number
              total_faturado: number
              total_saldo: number
            }[]
          }
      dashboard_trend_sdr: {
        Args: { _window_days: number }
        Returns: {
          criadas: number
          day: string
          realizadas: number
        }[]
      }
      dashboard_trend_vendas: {
        Args: { _closer_id?: string; _window_days: number }
        Returns: {
          day: string
          faturamento: number
          realizadas: number
          vendas: number
        }[]
      }
      dashboard_vendas_closer_perf: {
        Args: {
          p_channel?: string
          p_closer_id?: string
          p_from: string
          p_to: string
        }
        Returns: {
          closer_id: string
          realizadas: number
          receita: number
          vendas: number
        }[]
      }
      dashboard_vendas_kpis: {
        Args: { p_closer_id?: string; p_from: string; p_to: string }
        Returns: {
          coletado_avulsa: number
          coletado_calls: number
          faturado_avulsa: number
          faturado_calls: number
          nao_fechou: number
          ofertas_preco: number
          vendas_avulsas: number
          vendas_calls: number
          vendas_follow: number
          vendas_primeira_call: number
          vendas_sem_status_realizada: number
        }[]
      }
      dashboard_vendas_motivos: {
        Args: {
          p_channel?: string
          p_closer_id?: string
          p_from: string
          p_preco?: string
          p_to: string
        }
        Returns: {
          motivo: string
          qtd: number
          total_nao_fechou: number
        }[]
      }
      dashboard_vendas_realizadas_sem_closer: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      get_public_profiles: {
        Args: never
        Returns: {
          full_name: string
          is_sdr_override: boolean
          sdr_team: Database["public"]["Enums"]["sdr_team"]
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
      is_closer: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_manager_or_apresentador: { Args: never; Returns: boolean }
      is_manager_or_sdr: { Args: never; Returns: boolean }
      limpar_registros_antigos: {
        Args: never
        Returns: {
          audit_logs_removidos: number
          notificacoes_removidas: number
        }[]
      }
      notify_meta_capi: {
        Args: {
          _agendamento_id: string
          _event_name: string
          _venda_id: string
        }
        Returns: undefined
      }
      reassign_agendamento_closer_for_result: {
        Args: { _agendamento_id: string; _new_closer_id: string }
        Returns: boolean
      }
      record_sdr_downsell_event: {
        Args: {
          _evento: string
          _form_id?: string
          _nome?: string
          _telefone: string
          _utm_content?: string
        }
        Returns: undefined
      }
      transfer_agendamento_closer: {
        Args: { _agendamento_id: string; _new_closer_id: string }
        Returns: boolean
      }
      unassign_agendamentos_from_closer: {
        Args: { _closer_id: string; _reason: string }
        Returns: number
      }
      venda_closing_date: {
        Args: { _closed_at: string; _updated_at: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "sdr"
        | "gestor"
        | "closer"
        | "moderador"
        | "supervisor"
        | "apresentador"
      appointment_status:
        | "pendente"
        | "confirmada"
        | "realizada"
        | "cancelada"
        | "reagendada"
        | "no_show"
        | "nao_confirmada"
        | "agendada"
      sdr_team: "trafego" | "social_selling"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "sdr",
        "gestor",
        "closer",
        "moderador",
        "supervisor",
        "apresentador",
      ],
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
      sdr_team: ["trafego", "social_selling"],
    },
  },
} as const
