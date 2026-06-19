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
        ]
      }
      church_settings: {
        Row: {
          address: string | null
          created_at: string
          email_from_name: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          reminder_days_before: number
          request_nudge_days: number
          singleton: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email_from_name?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          reminder_days_before?: number
          request_nudge_days?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email_from_name?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          reminder_days_before?: number
          request_nudge_days?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      people: {
        Row: {
          auth_user_id: string | null
          birthday: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "person_pairings_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "people"
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
          created_at: string
          description: string | null
          id: string
          key_override: string | null
          kind: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds: number
          plan_id: string
          song_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          plan_id: string
          song_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          plan_id?: string
          song_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_template_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key_override: string | null
          kind: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds: number
          song_id: string | null
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          song_id?: string | null
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key_override?: string | null
          kind?: Database["public"]["Enums"]["plan_item_kind"]
          length_seconds?: number
          song_id?: string | null
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
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
      song_arrangements: {
        Row: {
          bpm: number | null
          created_at: string
          id: string
          is_default: boolean
          meter: string | null
          name: string
          song_id: string
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
          song_id: string
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
          song_id?: string
          song_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_arrangements_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_attachments: {
        Row: {
          created_at: string
          id: string
          label: string
          song_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          song_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          song_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_attachments_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          author: string | null
          ccli_number: string | null
          created_at: string
          id: string
          lyrics: string | null
          status: Database["public"]["Enums"]["song_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          ccli_number?: string | null
          created_at?: string
          id?: string
          lyrics?: string | null
          status?: Database["public"]["Enums"]["song_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          ccli_number?: string | null
          created_at?: string
          id?: string
          lyrics?: string | null
          status?: Database["public"]["Enums"]["song_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "team_members_team_id_fkey"
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      song_usage: {
        Row: {
          last_used: string | null
          next_scheduled: string | null
          song_id: string | null
          use_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
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
    }
    Enums: {
      app_role: "admin" | "leader" | "member"
      assignment_status: "pending" | "confirmed" | "declined"
      pairing_kind: "prefer" | "avoid" | "together"
      pairing_strength: "hard" | "soft"
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
    },
  },
} as const

