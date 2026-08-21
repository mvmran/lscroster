export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      audit_log: {
        Row: {
          action: string
          actor_label: string | null
          actor_person_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          summary: string
          target_label: string | null
          target_person_id: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_person_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          summary: string
          target_label?: string | null
          target_person_id?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_person_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          summary?: string
          target_label?: string | null
          target_person_id?: string | null
        }
        Relationships: []
      }
      blockout_dates: {
        Row: {
          created_at: string
          end_date: string
          id: string
          person_id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          person_id: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          person_id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blockout_dates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockout_dates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      church_settings: {
        Row: {
          address: string | null
          brand_hue: number
          created_at: string
          email_from_name: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          notify_on_publish: boolean
          nudge_hour: number
          reminder_days_before: number
          reminder_hour: number
          request_nudge_days: number
          roster_status_hour: number
          roster_status_weeks: number
          send_setlist_on_publish: boolean
          singleton: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_hue?: number
          created_at?: string
          email_from_name?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          notify_on_publish?: boolean
          nudge_hour?: number
          reminder_days_before?: number
          reminder_hour?: number
          request_nudge_days?: number
          roster_status_hour?: number
          roster_status_weeks?: number
          send_setlist_on_publish?: boolean
          singleton?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_hue?: number
          created_at?: string
          email_from_name?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          notify_on_publish?: boolean
          nudge_hour?: number
          reminder_days_before?: number
          reminder_hour?: number
          request_nudge_days?: number
          roster_status_hour?: number
          roster_status_weeks?: number
          send_setlist_on_publish?: boolean
          singleton?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      conditional_rule_effects: {
        Row: {
          created_at: string
          effect_kind: string
          id: string
          min_count: number | null
          required_person_id: string | null
          rule_id: string
          target_position_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effect_kind?: string
          id?: string
          min_count?: number | null
          required_person_id?: string | null
          rule_id: string
          target_position_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effect_kind?: string
          id?: string
          min_count?: number | null
          required_person_id?: string | null
          rule_id?: string
          target_position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditional_rule_effects_required_person_id_fkey"
            columns: ["required_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rule_effects_required_person_id_fkey"
            columns: ["required_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rule_effects_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "conditional_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rule_effects_target_position_id_fkey"
            columns: ["target_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      conditional_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          service_type_id: string | null
          strength: Database["public"]["Enums"]["pairing_strength"]
          trigger_attribute: string
          trigger_person_id: string | null
          trigger_position_id: string
          trigger_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          service_type_id?: string | null
          strength?: Database["public"]["Enums"]["pairing_strength"]
          trigger_attribute: string
          trigger_person_id?: string | null
          trigger_position_id: string
          trigger_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          service_type_id?: string | null
          strength?: Database["public"]["Enums"]["pairing_strength"]
          trigger_attribute?: string
          trigger_person_id?: string | null
          trigger_position_id?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditional_rules_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rules_trigger_person_id_fkey"
            columns: ["trigger_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rules_trigger_person_id_fkey"
            columns: ["trigger_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_rules_trigger_position_id_fkey"
            columns: ["trigger_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          person_id: string | null
          plan_id: string | null
          status: string
          subject: string | null
          template: string
          to_email: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          person_id?: string | null
          plan_id?: string | null
          status?: string
          subject?: string | null
          template: string
          to_email: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          person_id?: string | null
          plan_id?: string | null
          status?: string
          subject?: string | null
          template?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          person_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          person_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          person_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          auth_user_id: string | null
          birthday: string | null
          created_at: string
          email: string | null
          first_name: string
          has_email: boolean
          id: string
          last_name: string
          managed_accepted_at: string | null
          managed_by_person_id: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          sex: Database["public"]["Enums"]["person_sex"] | null
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          has_email?: boolean
          id?: string
          last_name: string
          managed_accepted_at?: string | null
          managed_by_person_id?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          sex?: Database["public"]["Enums"]["person_sex"] | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          has_email?: boolean
          id?: string
          last_name?: string
          managed_accepted_at?: string | null
          managed_by_person_id?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          sex?: Database["public"]["Enums"]["person_sex"] | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_managed_by_person_id_fkey"
            columns: ["managed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_managed_by_person_id_fkey"
            columns: ["managed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      person_email_prefs: {
        Row: {
          created_at: string
          nudge_emails: boolean
          person_id: string
          publish_emails: boolean
          reminder_emails: boolean
          roster_emails: boolean
          roster_status_emails: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          nudge_emails?: boolean
          person_id: string
          publish_emails?: boolean
          reminder_emails?: boolean
          roster_emails?: boolean
          roster_status_emails?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          nudge_emails?: boolean
          person_id?: string
          publish_emails?: boolean
          reminder_emails?: boolean
          roster_emails?: boolean
          roster_status_emails?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_email_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_email_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      person_pairings: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["pairing_kind"]
          person_a: string
          person_b: string
          reason: string | null
          strength: Database["public"]["Enums"]["pairing_strength"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["pairing_kind"]
          person_a: string
          person_b: string
          reason?: string | null
          strength?: Database["public"]["Enums"]["pairing_strength"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["pairing_kind"]
          person_a?: string
          person_b?: string
          reason?: string | null
          strength?: Database["public"]["Enums"]["pairing_strength"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_pairings_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pairings_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pairings_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pairings_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      person_recurring_unavailability: {
        Row: {
          created_at: string
          id: string
          person_id: string
          reason: string | null
          updated_at: string
          week_of_month: number | null
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          reason?: string | null
          updated_at?: string
          week_of_month?: number | null
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          reason?: string | null
          updated_at?: string
          week_of_month?: number | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_recurring_unavailability_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_recurring_unavailability_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      person_scheduling_prefs: {
        Row: {
          created_at: string
          max_consecutive: number | null
          max_per_month: number | null
          min_gap_days: number
          person_id: string
          status: Database["public"]["Enums"]["scheduling_status"]
          target_per_month: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          max_consecutive?: number | null
          max_per_month?: number | null
          min_gap_days?: number
          person_id: string
          status?: Database["public"]["Enums"]["scheduling_status"]
          target_per_month?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          max_consecutive?: number | null
          max_per_month?: number | null
          min_gap_days?: number
          person_id?: string
          status?: Database["public"]["Enums"]["scheduling_status"]
          target_per_month?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_scheduling_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_scheduling_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_assignments: {
        Row: {
          created_at: string
          decline_reason: string | null
          id: string
          notified_at: string | null
          nudged_at: string | null
          person_id: string
          plan_id: string
          position_id: string
          reminded_at: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          team_id: string
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          notified_at?: string | null
          nudged_at?: string | null
          person_id: string
          plan_id: string
          position_id: string
          reminded_at?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          team_id: string
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          notified_at?: string | null
          nudged_at?: string | null
          person_id?: string
          plan_id?: string
          position_id?: string
          reminded_at?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          team_id?: string
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_attachments: {
        Row: {
          created_at: string
          id: string
          label: string
          plan_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          plan_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          plan_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_attachments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          arrangement_id: string | null
          created_at: string
          description: string | null
          id: string
          key_override: string | null
          kind: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds: number
          lyrics_id: string | null
          plan_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          arrangement_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          lyrics_id?: string | null
          plan_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          arrangement_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          lyrics_id?: string | null
          plan_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_lyrics_id_fkey"
            columns: ["lyrics_id"]
            isOneToOne: false
            referencedRelation: "song_arrangement_lyrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_position_min_counts: {
        Row: {
          created_at: string
          id: string
          min_count: number
          plan_id: string
          position_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_count?: number
          plan_id: string
          position_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_count?: number
          plan_id?: string
          position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_position_min_counts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_position_min_counts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_rule_mutes: {
        Row: {
          created_at: string
          plan_id: string
          rule_id: string
        }
        Insert: {
          created_at?: string
          plan_id: string
          rule_id: string
        }
        Update: {
          created_at?: string
          plan_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_rule_mutes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_rule_mutes_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "conditional_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_template_items: {
        Row: {
          arrangement_id: string | null
          created_at: string
          description: string | null
          id: string
          key_override: string | null
          kind: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds: number
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          arrangement_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          arrangement_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_items_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_template_position_min_counts: {
        Row: {
          created_at: string
          id: string
          min_count: number
          position_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_count?: number
          position_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_count?: number
          position_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_position_min_counts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_template_position_min_counts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_template_times: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
          start_time: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          start_time: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          start_time?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_times_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          service_type_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          service_type_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          service_type_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_templates_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_times: {
        Row: {
          created_at: string
          id: string
          label: string
          plan_id: string
          sort_order: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          plan_id: string
          sort_order?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          plan_id?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_times_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          service_type_id: string
          start_time: string | null
          status: Database["public"]["Enums"]["plan_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          service_type_id: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          service_type_id?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          fill_priority: number
          id: string
          max_count: number | null
          min_count: number
          name: string
          requires_level: string | null
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fill_priority?: number
          id?: string
          max_count?: number | null
          min_count?: number
          name: string
          requires_level?: string | null
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fill_priority?: number
          id?: string
          max_count?: number | null
          min_count?: number
          name?: string
          requires_level?: string | null
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      projection_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projection_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      projection_api_requests: {
        Row: {
          endpoint: string
          http_status: number
          id: number
          ip: string | null
          key_id: string | null
          plan_id: string | null
          requested_at: string
        }
        Insert: {
          endpoint: string
          http_status: number
          id?: never
          ip?: string | null
          key_id?: string | null
          plan_id?: string | null
          requested_at?: string
        }
        Update: {
          endpoint?: string
          http_status?: number
          id?: never
          ip?: string | null
          key_id?: string | null
          plan_id?: string | null
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_api_requests_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "projection_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_overrides: {
        Row: {
          created_at: string
          id: string
          message: string
          overridden_by: string | null
          plan_id: string
          reason: string | null
          rule_code: string
          severity: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          overridden_by?: string | null
          plan_id: string
          reason?: string | null
          rule_code: string
          severity: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          overridden_by?: string | null
          plan_id?: string
          reason?: string | null
          rule_code?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_overrides_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_overrides_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_overrides_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      service_type_teams: {
        Row: {
          created_at: string
          id: string
          service_type_id: string
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_type_id: string
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          service_type_id?: string
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_type_teams_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_type_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          days_of_week: number[]
          default_start_time: string | null
          end_time: string | null
          frequency: Database["public"]["Enums"]["service_frequency"] | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          default_start_time?: string | null
          end_time?: string | null
          frequency?: Database["public"]["Enums"]["service_frequency"] | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          default_start_time?: string | null
          end_time?: string | null
          frequency?: Database["public"]["Enums"]["service_frequency"] | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      setlist_recipients: {
        Row: {
          created_at: string
          id: string
          person_id: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_recipients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      song_arrangement_lyrics: {
        Row: {
          arrangement_id: string
          created_at: string
          id: string
          lyrics: string
          updated_at: string
          version: number
        }
        Insert: {
          arrangement_id: string
          created_at?: string
          id?: string
          lyrics: string
          updated_at?: string
          version?: number
        }
        Update: {
          arrangement_id?: string
          created_at?: string
          id?: string
          lyrics?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_arrangement_lyrics_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
        ]
      }
      song_arrangement_songs: {
        Row: {
          arrangement_id: string
          created_at: string
          song_id: string
          sort_order: number
        }
        Insert: {
          arrangement_id: string
          created_at?: string
          song_id: string
          sort_order?: number
        }
        Update: {
          arrangement_id?: string
          created_at?: string
          song_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_arrangement_songs_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_arrangement_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_arrangements: {
        Row: {
          bpm: number | null
          created_at: string
          id: string
          is_default: boolean
          meter: string | null
          name: string
          reference_url: string | null
          song_key: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          bpm?: number | null
          created_at?: string
          id?: string
          is_default?: boolean
          meter?: string | null
          name?: string
          reference_url?: string | null
          song_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bpm?: number | null
          created_at?: string
          id?: string
          is_default?: boolean
          meter?: string | null
          name?: string
          reference_url?: string | null
          song_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      song_attachments: {
        Row: {
          arrangement_id: string
          created_at: string
          id: string
          label: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          arrangement_id: string
          created_at?: string
          id?: string
          label: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          arrangement_id?: string
          created_at?: string
          id?: string
          label?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_attachments_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          author: string | null
          ccli_number: string | null
          copyright: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["song_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          ccli_number?: string | null
          copyright?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["song_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          ccli_number?: string | null
          copyright?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["song_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_leaders: {
        Row: {
          created_at: string
          id: string
          person_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_leaders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_positions: {
        Row: {
          created_at: string
          id: string
          position_id: string
          proficiency: Database["public"]["Enums"]["proficiency_level"]
          team_member_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          position_id: string
          proficiency?: Database["public"]["Enums"]["proficiency_level"]
          team_member_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          position_id?: string
          proficiency?: Database["public"]["Enums"]["proficiency_level"]
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_positions_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          person_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_viewers: {
        Row: {
          created_at: string
          id: string
          person_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_viewers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_viewers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_viewers_team_id_fkey"
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
          name: string
          sort_order: number
          team_type: Database["public"]["Enums"]["team_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          team_type?: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          team_type?: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      people_directory: {
        Row: {
          auth_user_id: string | null
          birthday: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          has_email: boolean | null
          id: string | null
          last_name: string | null
          managed_accepted_at: string | null
          managed_by_person_id: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          sex: Database["public"]["Enums"]["person_sex"] | null
          status: Database["public"]["Enums"]["person_status"] | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          birthday?: never
          created_at?: string | null
          email?: never
          first_name?: string | null
          has_email?: boolean | null
          id?: string | null
          last_name?: string | null
          managed_accepted_at?: string | null
          managed_by_person_id?: string | null
          notes?: string | null
          phone?: never
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          sex?: Database["public"]["Enums"]["person_sex"] | null
          status?: Database["public"]["Enums"]["person_status"] | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          birthday?: never
          created_at?: string | null
          email?: never
          first_name?: string | null
          has_email?: boolean | null
          id?: string | null
          last_name?: string | null
          managed_accepted_at?: string | null
          managed_by_person_id?: string | null
          notes?: string | null
          phone?: never
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          sex?: Database["public"]["Enums"]["person_sex"] | null
          status?: Database["public"]["Enums"]["person_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_managed_by_person_id_fkey"
            columns: ["managed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_managed_by_person_id_fkey"
            columns: ["managed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      song_plan_usage: {
        Row: {
          arrangement_id: string | null
          date: string | null
          key_override: string | null
          plan_id: string | null
          plan_item_id: string | null
          plan_status: Database["public"]["Enums"]["plan_status"] | null
          plan_title: string | null
          service_type_id: string | null
          service_type_name: string | null
          song_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "song_arrangements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_arrangement_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_usage: {
        Row: {
          last_used: string | null
          next_scheduled: string | null
          song_id: string | null
          use_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "song_arrangement_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      audit_record: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_summary: string
          p_target_label: string
          p_target_person_id: string
        }
        Returns: undefined
      }
      can_manage_team: { Args: { target_team_id: string }; Returns: boolean }
      can_view_contact: { Args: { target: string }; Returns: boolean }
      current_actor_person_id: { Args: never; Returns: string }
      current_person_id: { Args: never; Returns: string }
      current_person_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_leader: { Args: never; Returns: boolean }
      is_assigned_to_plan: {
        Args: { target_plan_id: string }
        Returns: boolean
      }
      is_viewer_of_plan: { Args: { target_plan_id: string }; Returns: boolean }
      leads_team: { Args: { target_team_id: string }; Returns: boolean }
      leads_team_on_plan: { Args: { target_plan_id: string }; Returns: boolean }
      manages_person: { Args: { target: string }; Returns: boolean }
      manages_photo_folder: { Args: { object_name: string }; Returns: boolean }
      pin_plan_lyrics: { Args: { p_plan_id: string }; Returns: undefined }
      team_of_member: { Args: { target_member_id: string }; Returns: string }
      views_team: { Args: { target_team_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "leader" | "member"
      assignment_status: "pending" | "confirmed" | "declined"
      pairing_kind: "prefer" | "avoid" | "together"
      pairing_strength: "hard" | "soft"
      person_sex: "male" | "female"
      person_status: "active" | "inactive"
      plan_item_kind: "header" | "song" | "item"
      plan_status: "draft" | "published"
      proficiency_level: "trainee" | "qualified"
      scheduling_status: "active" | "break" | "pending"
      service_frequency:
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      song_status: "active" | "archived"
      team_type: "general" | "worship" | "media"
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
      app_role: ["admin", "leader", "member"],
      assignment_status: ["pending", "confirmed", "declined"],
      pairing_kind: ["prefer", "avoid", "together"],
      pairing_strength: ["hard", "soft"],
      person_sex: ["male", "female"],
      person_status: ["active", "inactive"],
      plan_item_kind: ["header", "song", "item"],
      plan_status: ["draft", "published"],
      proficiency_level: ["trainee", "qualified"],
      scheduling_status: ["active", "break", "pending"],
      service_frequency: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      song_status: ["active", "archived"],
      team_type: ["general", "worship", "media"],
    },
  },
} as const

