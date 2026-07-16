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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string
          name: string
        }
        Insert: {
          applied_at?: string
          name: string
        }
        Update: {
          applied_at?: string
          name?: string
        }
        Relationships: []
      }
      agent_configs: {
        Row: {
          after_hours_behavior: string
          booking_policy: Json
          clinic_id: string
          created_at: string
          custom_instructions: string | null
          enabled: boolean
          escalation_number: string | null
          faq: Json
          greeting: string | null
          id: string
          language: string
          recording_enabled: boolean
          updated_at: string
          voice: string
        }
        Insert: {
          after_hours_behavior?: string
          booking_policy?: Json
          clinic_id: string
          created_at?: string
          custom_instructions?: string | null
          enabled?: boolean
          escalation_number?: string | null
          faq?: Json
          greeting?: string | null
          id?: string
          language?: string
          recording_enabled?: boolean
          updated_at?: string
          voice?: string
        }
        Update: {
          after_hours_behavior?: string
          booking_policy?: Json
          clinic_id?: string
          created_at?: string
          custom_instructions?: string | null
          enabled?: boolean
          escalation_number?: string | null
          faq?: Json
          greeting?: string | null
          id?: string
          language?: string
          recording_enabled?: boolean
          updated_at?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_types: {
        Row: {
          active: boolean
          bookable_by_ai: boolean
          buffer_minutes: number
          clinic_id: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bookable_by_ai?: boolean
          buffer_minutes?: number
          clinic_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bookable_by_ai?: boolean
          buffer_minutes?: number
          clinic_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_types_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type_id: string | null
          cancellation_reason: string | null
          clinic_id: string
          created_at: string
          created_by_call: string | null
          created_by_user: string | null
          doctor_id: string
          ends_at: string
          id: string
          notes: string | null
          patient_id: string
          source: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          appointment_type_id?: string | null
          cancellation_reason?: string | null
          clinic_id: string
          created_at?: string
          created_by_call?: string | null
          created_by_user?: string | null
          doctor_id: string
          ends_at: string
          id?: string
          notes?: string | null
          patient_id: string
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          appointment_type_id?: string | null
          cancellation_reason?: string | null
          clinic_id?: string
          created_at?: string
          created_by_call?: string | null
          created_by_user?: string | null
          doctor_id?: string
          ends_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_appointment_type_id_fkey"
            columns: ["appointment_type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_call_fkey"
            columns: ["created_by_call"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_exceptions: {
        Row: {
          clinic_id: string
          created_at: string
          date: string
          doctor_id: string
          end_time: string | null
          id: string
          kind: string
          reason: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date: string
          doctor_id: string
          end_time?: string | null
          id?: string
          kind: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date?: string
          doctor_id?: string
          end_time?: string | null
          id?: string
          kind?: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          clinic_id: string
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          doctor_id?: string
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_numbers: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          number: string
          reason: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          number: string
          reason?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          number?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_numbers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      call_events: {
        Row: {
          call_id: string
          clinic_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          call_id: string
          clinic_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          call_id?: string
          clinic_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          call_id: string
          clinic_id: string
          created_at: string
          extracted_data: Json
          id: string
          outcome: Database["public"]["Enums"]["call_outcome"] | null
          summary: string | null
          turns: Json
          updated_at: string
        }
        Insert: {
          call_id: string
          clinic_id: string
          created_at?: string
          extracted_data?: Json
          id?: string
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          summary?: string | null
          turns?: Json
          updated_at?: string
        }
        Update: {
          call_id?: string
          clinic_id?: string
          created_at?: string
          extracted_data?: Json
          id?: string
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          summary?: string | null
          turns?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcripts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          clinic_id: string
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          patient_id: string | null
          provider_call_id: string | null
          recording_url: string | null
          spam_reasons: Json
          spam_score: number | null
          started_at: string
          status: string
          to_number: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          patient_id?: string | null
          provider_call_id?: string | null
          recording_url?: string | null
          spam_reasons?: Json
          spam_score?: number | null
          started_at?: string
          status?: string
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          patient_id?: string | null
          provider_call_id?: string | null
          recording_url?: string | null
          spam_reasons?: Json
          spam_score?: number | null
          started_at?: string
          status?: string
          to_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_integrations: {
        Row: {
          clinic_id: string
          config: Json
          created_at: string
          credentials_ref: string | null
          id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          config?: Json
          created_at?: string
          credentials_ref?: string | null
          id?: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          config?: Json
          created_at?: string
          credentials_ref?: string | null
          id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_integrations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          business_hours: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["clinic_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_hours?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["clinic_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_hours?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["clinic_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          active: boolean
          bio: string | null
          clinic_id: string
          created_at: string
          id: string
          name: string
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          clinic_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          clinic_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role: Database["public"]["Enums"]["member_role"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          clinic_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          clinic_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          flags: Json
          id: string
          last_name: string
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          flags?: Json
          id?: string
          last_name: string
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          flags?: Json
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          integration_id: string | null
          is_primary: boolean
          number: string
          provider: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_primary?: boolean
          number: string
          provider?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_primary?: boolean
          number?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "clinic_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_clinic: {
        Args: { p_name: string; p_slug: string; p_timezone?: string }
        Returns: {
          address: string | null
          business_hours: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["clinic_status"]
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clinics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      appointment_source: "ai_call" | "dashboard" | "api"
      appointment_status:
        | "booked"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      call_outcome:
        | "booked"
        | "cancelled"
        | "rescheduled"
        | "info"
        | "voicemail"
        | "spam"
        | "escalated"
        | "incomplete"
      clinic_status: "onboarding" | "active" | "suspended"
      member_role: "owner" | "doctor" | "staff"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_source: ["ai_call", "dashboard", "api"],
      appointment_status: [
        "booked",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      call_outcome: [
        "booked",
        "cancelled",
        "rescheduled",
        "info",
        "voicemail",
        "spam",
        "escalated",
        "incomplete",
      ],
      clinic_status: ["onboarding", "active", "suspended"],
      member_role: ["owner", "doctor", "staff"],
    },
  },
} as const
