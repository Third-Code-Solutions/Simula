export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  api: {
    Tables: {
      audience_versions: {
        Row: {
          admission_status: Database["api"]["Enums"]["audience_admission_status"]
          audience_id: string
          checksum_sha256: string
          created_at: string
          id: string
          is_non_representative: boolean
          kind: Database["api"]["Enums"]["audience_kind"]
          limitations: string
          manifest: Json
          organization_id: string | null
          version: number
        }
        Insert: {
          admission_status: Database["api"]["Enums"]["audience_admission_status"]
          audience_id: string
          checksum_sha256: string
          created_at?: string
          id?: string
          is_non_representative: boolean
          kind: Database["api"]["Enums"]["audience_kind"]
          limitations: string
          manifest: Json
          organization_id?: string | null
          version: number
        }
        Update: {
          admission_status?: Database["api"]["Enums"]["audience_admission_status"]
          audience_id?: string
          checksum_sha256?: string
          created_at?: string
          id?: string
          is_non_representative?: boolean
          kind?: Database["api"]["Enums"]["audience_kind"]
          limitations?: string
          manifest?: Json
          organization_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audience_versions_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      audiences: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_public_demo: boolean
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public_demo?: boolean
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_public_demo?: boolean
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          created_by: string
          organization_id: string
          role: Database["api"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          organization_id: string
          role: Database["api"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          organization_id?: string
          role?: Database["api"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          status: Database["api"]["Enums"]["organization_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          status?: Database["api"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          status?: Database["api"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          category: string
          created_at: string
          created_by: string
          id: string
          language: string
          market: string
          name: string
          objective: string
          organization_id: string
          status: Database["api"]["Enums"]["project_status"]
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          id?: string
          language: string
          market: string
          name: string
          objective: string
          organization_id: string
          status?: Database["api"]["Enums"]["project_status"]
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string
          market?: string
          name?: string
          objective?: string
          organization_id?: string
          status?: Database["api"]["Enums"]["project_status"]
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_results: {
        Row: {
          artifact: Json
          artifact_sha256: string
          created_at: string
          id: string
          organization_id: string
          run_id: string
          schema_version: number
        }
        Insert: {
          artifact: Json
          artifact_sha256: string
          created_at?: string
          id?: string
          organization_id: string
          run_id: string
          schema_version: number
        }
        Update: {
          artifact?: Json
          artifact_sha256?: string
          created_at?: string
          id?: string
          organization_id?: string
          run_id?: string
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulation_results_run_foreign_key"
            columns: ["organization_id", "run_id"]
            isOneToOne: false
            referencedRelation: "simulation_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      simulation_runs: {
        Row: {
          attempt_count: number
          audience_version_id: string
          correlation_id: string
          created_at: string
          created_by: string
          deterministic_seed: number
          dispatch_generation: number
          frozen_manifest: Json
          frozen_manifest_sha256: string
          id: string
          last_progress_at: string | null
          organization_id: string
          project_id: string
          schema_version: number
          state: Database["api"]["Enums"]["run_state"]
          stimulus_version_id: string
          terminal_at: string | null
          updated_at: string
          worker_lease_expires_at: string | null
          worker_lease_token: string | null
        }
        Insert: {
          attempt_count?: number
          audience_version_id: string
          correlation_id: string
          created_at?: string
          created_by: string
          deterministic_seed: number
          dispatch_generation?: number
          frozen_manifest: Json
          frozen_manifest_sha256: string
          id?: string
          last_progress_at?: string | null
          organization_id: string
          project_id: string
          schema_version: number
          state?: Database["api"]["Enums"]["run_state"]
          stimulus_version_id: string
          terminal_at?: string | null
          updated_at?: string
          worker_lease_expires_at?: string | null
          worker_lease_token?: string | null
        }
        Update: {
          attempt_count?: number
          audience_version_id?: string
          correlation_id?: string
          created_at?: string
          created_by?: string
          deterministic_seed?: number
          dispatch_generation?: number
          frozen_manifest?: Json
          frozen_manifest_sha256?: string
          id?: string
          last_progress_at?: string | null
          organization_id?: string
          project_id?: string
          schema_version?: number
          state?: Database["api"]["Enums"]["run_state"]
          stimulus_version_id?: string
          terminal_at?: string | null
          updated_at?: string
          worker_lease_expires_at?: string | null
          worker_lease_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_runs_audience_version_id_fkey"
            columns: ["audience_version_id"]
            isOneToOne: false
            referencedRelation: "audience_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_runs_project_foreign_key"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "simulation_runs_stimulus_version_foreign_key"
            columns: ["organization_id", "stimulus_version_id"]
            isOneToOne: false
            referencedRelation: "stimulus_versions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stimuli: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          project_id: string
          status: Database["api"]["Enums"]["stimulus_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          project_id: string
          status?: Database["api"]["Enums"]["stimulus_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          status?: Database["api"]["Enums"]["stimulus_status"]
        }
        Relationships: [
          {
            foreignKeyName: "stimuli_project_foreign_key"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stimulus_versions: {
        Row: {
          content: string
          content_sha256: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          stimulus_id: string
          version: number
        }
        Insert: {
          content: string
          content_sha256: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          stimulus_id: string
          version: number
        }
        Update: {
          content?: string
          content_sha256?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          stimulus_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stimulus_versions_stimulus_foreign_key"
            columns: ["organization_id", "stimulus_id"]
            isOneToOne: false
            referencedRelation: "stimuli"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_stimulus_version: {
        Args: {
          requested_content: string
          requested_content_sha256: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_stimulus_id: string
        }
        Returns: {
          content: string
          content_sha256: string
          created_at: string
          organization_id: string
          replayed: boolean
          stimulus_id: string
          stimulus_version: number
          version_id: string
        }[]
      }
      create_organization: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_name: string
          requested_sha256: string
        }
        Returns: {
          membership_role: Database["api"]["Enums"]["organization_role"]
          organization_id: string
          organization_name: string
          replayed: boolean
        }[]
      }
      create_project: {
        Args: {
          requested_category: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_language: string
          requested_market: string
          requested_name: string
          requested_objective: string
          requested_organization_id: string
          requested_sha256: string
        }
        Returns: {
          category: string
          created_at: string
          language: string
          market: string
          objective: string
          organization_id: string
          project_id: string
          project_name: string
          project_status: Database["api"]["Enums"]["project_status"]
          project_version: number
          replayed: boolean
          updated_at: string
        }[]
      }
      create_stimulus: {
        Args: {
          requested_content: string
          requested_content_sha256: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_name: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: {
          content: string
          content_sha256: string
          organization_id: string
          project_id: string
          replayed: boolean
          stimulus_created_at: string
          stimulus_id: string
          stimulus_name: string
          stimulus_status: Database["api"]["Enums"]["stimulus_status"]
          stimulus_version: number
          stimulus_version_id: string
          version_created_at: string
        }[]
      }
      list_organizations: {
        Args: never
        Returns: {
          created_at: string
          membership_role: Database["api"]["Enums"]["organization_role"]
          organization_id: string
          organization_name: string
          organization_status: Database["api"]["Enums"]["organization_status"]
        }[]
      }
      update_project: {
        Args: {
          requested_category: string
          requested_correlation_id: string
          requested_expected_version: number
          requested_language: string
          requested_market: string
          requested_name: string
          requested_objective: string
          requested_project_id: string
        }
        Returns: {
          category: string
          created_at: string
          language: string
          market: string
          objective: string
          organization_id: string
          project_id: string
          project_name: string
          project_status: Database["api"]["Enums"]["project_status"]
          project_version: number
          updated_at: string
        }[]
      }
    }
    Enums: {
      audience_admission_status: "approved_demo" | "revoked"
      audience_kind: "authored_demo"
      organization_role: "owner" | "editor" | "viewer"
      organization_status: "active" | "disabled" | "deleted"
      project_status: "active" | "archived" | "deleted"
      run_state:
        | "queued"
        | "running"
        | "retrying"
        | "cancel_requested"
        | "canceled"
        | "succeeded"
        | "failed"
      stimulus_status: "active" | "retired" | "deleted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  private: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_type: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          correlation_id: string
          created_at: string
          id: string
          metadata: Json
          object_id: string | null
          object_type: string
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_type: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          correlation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          object_id?: string | null
          object_type: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_type?: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          object_id?: string | null
          object_type?: string
          organization_id?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          idempotency_key: string
          organization_id: string | null
          request_sha256: string
          resource_id: string | null
          response: Json | null
          scope: string
          scope_organization_id: string | null
          scope_resource_id: string | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          organization_id?: string | null
          request_sha256: string
          resource_id?: string | null
          response?: Json | null
          scope: string
          scope_organization_id?: string | null
          scope_resource_id?: string | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          organization_id?: string | null
          request_sha256?: string
          resource_id?: string | null
          response?: Json | null
          scope?: string
          scope_organization_id?: string | null
          scope_resource_id?: string | null
        }
        Relationships: []
      }
      run_attempts: {
        Row: {
          attempt_number: number
          finished_at: string | null
          id: string
          lease_expires_at: string
          lease_token: string
          organization_id: string
          run_id: string
          safe_error_code: string | null
          started_at: string
          status: Database["private"]["Enums"]["attempt_status"]
        }
        Insert: {
          attempt_number: number
          finished_at?: string | null
          id?: string
          lease_expires_at: string
          lease_token: string
          organization_id: string
          run_id: string
          safe_error_code?: string | null
          started_at?: string
          status: Database["private"]["Enums"]["attempt_status"]
        }
        Update: {
          attempt_number?: number
          finished_at?: string | null
          id?: string
          lease_expires_at?: string
          lease_token?: string
          organization_id?: string
          run_id?: string
          safe_error_code?: string | null
          started_at?: string
          status?: Database["private"]["Enums"]["attempt_status"]
        }
        Relationships: []
      }
      run_events: {
        Row: {
          actor_type: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          attempt_number: number | null
          correlation_id: string
          created_at: string
          id: string
          new_state: Database["api"]["Enums"]["run_state"]
          organization_id: string
          previous_state: Database["api"]["Enums"]["run_state"] | null
          run_id: string
          safe_reason: string | null
        }
        Insert: {
          actor_type: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          attempt_number?: number | null
          correlation_id: string
          created_at?: string
          id?: string
          new_state: Database["api"]["Enums"]["run_state"]
          organization_id: string
          previous_state?: Database["api"]["Enums"]["run_state"] | null
          run_id: string
          safe_reason?: string | null
        }
        Update: {
          actor_type?: Database["private"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          attempt_number?: number | null
          correlation_id?: string
          created_at?: string
          id?: string
          new_state?: Database["api"]["Enums"]["run_state"]
          organization_id?: string
          previous_state?: Database["api"]["Enums"]["run_state"] | null
          run_id?: string
          safe_reason?: string | null
        }
        Relationships: []
      }
      run_outbox: {
        Row: {
          claim_expires_at: string | null
          claim_token: string | null
          confirmed_at: string | null
          created_at: string
          dispatch_attempt_count: number
          generation: number
          id: string
          job_id: string
          next_attempt_at: string
          organization_id: string
          run_id: string
          status: Database["private"]["Enums"]["outbox_status"]
          terminal_error_code: string | null
          updated_at: string
        }
        Insert: {
          claim_expires_at?: string | null
          claim_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          dispatch_attempt_count?: number
          generation: number
          id?: string
          job_id: string
          next_attempt_at?: string
          organization_id: string
          run_id: string
          status?: Database["private"]["Enums"]["outbox_status"]
          terminal_error_code?: string | null
          updated_at?: string
        }
        Update: {
          claim_expires_at?: string | null
          claim_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          dispatch_attempt_count?: number
          generation?: number
          id?: string
          job_id?: string
          next_attempt_at?: string
          organization_id?: string
          run_id?: string
          status?: Database["private"]["Enums"]["outbox_status"]
          terminal_error_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_stimulus_version_atomic: {
        Args: {
          requested_content: string
          requested_content_sha256: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_stimulus_id: string
        }
        Returns: {
          content: string
          content_sha256: string
          created_at: string
          organization_id: string
          replayed: boolean
          stimulus_id: string
          stimulus_version: number
          version_id: string
        }[]
      }
      create_organization_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_name: string
          requested_sha256: string
        }
        Returns: {
          membership_role: Database["api"]["Enums"]["organization_role"]
          organization_id: string
          organization_name: string
          replayed: boolean
        }[]
      }
      create_project_atomic: {
        Args: {
          requested_category: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_language: string
          requested_market: string
          requested_name: string
          requested_objective: string
          requested_organization_id: string
          requested_sha256: string
        }
        Returns: {
          category: string
          created_at: string
          language: string
          market: string
          objective: string
          organization_id: string
          project_id: string
          project_name: string
          project_status: Database["api"]["Enums"]["project_status"]
          project_version: number
          replayed: boolean
          updated_at: string
        }[]
      }
      create_stimulus_atomic: {
        Args: {
          requested_content: string
          requested_content_sha256: string
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_name: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: {
          content: string
          content_sha256: string
          organization_id: string
          project_id: string
          replayed: boolean
          stimulus_created_at: string
          stimulus_id: string
          stimulus_name: string
          stimulus_status: Database["api"]["Enums"]["stimulus_status"]
          stimulus_version: number
          stimulus_version_id: string
          version_created_at: string
        }[]
      }
      has_org_role: {
        Args: {
          allowed_roles: Database["api"]["Enums"]["organization_role"][]
          requested_organization_id: string
          requested_user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { requested_organization_id: string; requested_user_id: string }
        Returns: boolean
      }
      is_verified_api_subject: {
        Args: { expected_user_id: string }
        Returns: boolean
      }
      update_project_atomic: {
        Args: {
          requested_category: string
          requested_correlation_id: string
          requested_expected_version: number
          requested_language: string
          requested_market: string
          requested_name: string
          requested_objective: string
          requested_project_id: string
        }
        Returns: {
          category: string
          created_at: string
          language: string
          market: string
          objective: string
          organization_id: string
          project_id: string
          project_name: string
          project_status: Database["api"]["Enums"]["project_status"]
          project_version: number
          updated_at: string
        }[]
      }
      verified_subject: { Args: never; Returns: string }
    }
    Enums: {
      attempt_status:
        | "running"
        | "succeeded"
        | "retrying"
        | "failed"
        | "canceled"
        | "superseded"
      audit_actor_type: "user" | "worker" | "system"
      outbox_status: "pending" | "claimed" | "dispatched" | "terminal"
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
  api: {
    Enums: {
      audience_admission_status: ["approved_demo", "revoked"],
      audience_kind: ["authored_demo"],
      organization_role: ["owner", "editor", "viewer"],
      organization_status: ["active", "disabled", "deleted"],
      project_status: ["active", "archived", "deleted"],
      run_state: [
        "queued",
        "running",
        "retrying",
        "cancel_requested",
        "canceled",
        "succeeded",
        "failed",
      ],
      stimulus_status: ["active", "retired", "deleted"],
    },
  },
  private: {
    Enums: {
      attempt_status: [
        "running",
        "succeeded",
        "retrying",
        "failed",
        "canceled",
        "superseded",
      ],
      audit_actor_type: ["user", "worker", "system"],
      outbox_status: ["pending", "claimed", "dispatched", "terminal"],
    },
  },
} as const

