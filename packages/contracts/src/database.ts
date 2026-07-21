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
      evaluation_runs: {
        Row: {
          benchmark_checksum_sha256: string
          created_at: string
          created_by: string
          id: string
          limitations: string[]
          methodology_version_id: string
          metrics: Json
          organization_id: string
          simulation_configuration_version_id: string
          slice_metrics: Json
          status: Database["api"]["Enums"]["evaluation_status"]
        }
        Insert: {
          benchmark_checksum_sha256: string
          created_at?: string
          created_by: string
          id?: string
          limitations: string[]
          methodology_version_id: string
          metrics: Json
          organization_id: string
          simulation_configuration_version_id: string
          slice_metrics: Json
          status: Database["api"]["Enums"]["evaluation_status"]
        }
        Update: {
          benchmark_checksum_sha256?: string
          created_at?: string
          created_by?: string
          id?: string
          limitations?: string[]
          methodology_version_id?: string
          metrics?: Json
          organization_id?: string
          simulation_configuration_version_id?: string
          slice_metrics?: Json
          status?: Database["api"]["Enums"]["evaluation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_runs_configuration_foreign_key"
            columns: ["organization_id", "simulation_configuration_version_id"]
            isOneToOne: false
            referencedRelation: "simulation_configuration_versions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "evaluation_runs_methodology_version_id_fkey"
            columns: ["methodology_version_id"]
            isOneToOne: false
            referencedRelation: "methodology_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          created_by: string
          enabled: boolean
          flag_key: string
          id: string
          organization_id: string
          reason: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          enabled: boolean
          flag_key: string
          id?: string
          organization_id: string
          reason: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          organization_id?: string
          reason?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_records: {
        Row: {
          checksum_sha256: string
          created_at: string
          created_by: string
          id: string
          kind: Database["api"]["Enums"]["feedback_kind"]
          observed_at: string
          organization_id: string
          payload: Json
          provenance: Json
          rights_basis: string
          run_id: string | null
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          created_by: string
          id?: string
          kind: Database["api"]["Enums"]["feedback_kind"]
          observed_at: string
          organization_id: string
          payload: Json
          provenance: Json
          rights_basis: string
          run_id?: string | null
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["api"]["Enums"]["feedback_kind"]
          observed_at?: string
          organization_id?: string
          payload?: Json
          provenance?: Json
          rights_basis?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_records_run_foreign_key"
            columns: ["organization_id", "run_id"]
            isOneToOne: false
            referencedRelation: "simulation_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      methodology_versions: {
        Row: {
          checksum_sha256: string
          created_at: string
          id: string
          limitations: string[]
          manifest: Json
          methodology_key: string
          validation_status: Database["api"]["Enums"]["validation_status"]
          version: number
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          id?: string
          limitations: string[]
          manifest: Json
          methodology_key: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
          version: number
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          id?: string
          limitations?: string[]
          manifest?: Json
          methodology_key?: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
          version?: number
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          organization_id: string
          revoked_at: string | null
          role: Database["api"]["Enums"]["organization_role"]
          status: Database["api"]["Enums"]["invitation_status"]
          token_sha256: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          organization_id: string
          revoked_at?: string | null
          role: Database["api"]["Enums"]["organization_role"]
          status?: Database["api"]["Enums"]["invitation_status"]
          token_sha256: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          revoked_at?: string | null
          role?: Database["api"]["Enums"]["organization_role"]
          status?: Database["api"]["Enums"]["invitation_status"]
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
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
      population_frame_versions: {
        Row: {
          checksum_sha256: string
          created_at: string
          created_by: string | null
          id: string
          limitations: string[]
          manifest: Json
          organization_id: string | null
          population_frame_id: string
          validation_status: Database["api"]["Enums"]["validation_status"]
          version: number
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          created_by?: string | null
          id?: string
          limitations: string[]
          manifest: Json
          organization_id?: string | null
          population_frame_id: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
          version: number
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          created_by?: string | null
          id?: string
          limitations?: string[]
          manifest?: Json
          organization_id?: string | null
          population_frame_id?: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "population_frame_versions_population_frame_id_fkey"
            columns: ["population_frame_id"]
            isOneToOne: false
            referencedRelation: "population_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      population_frames: {
        Row: {
          created_at: string
          created_by: string | null
          geography: string
          id: string
          name: string
          organization_id: string | null
          target_population: string
          validation_status: Database["api"]["Enums"]["validation_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          geography: string
          id?: string
          name: string
          organization_id?: string | null
          target_population: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          geography?: string
          id?: string
          name?: string
          organization_id?: string | null
          target_population?: string
          validation_status?: Database["api"]["Enums"]["validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "population_frames_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      provider_configuration_versions: {
        Row: {
          admission_status: Database["api"]["Enums"]["provider_admission_status"]
          checksum_sha256: string
          created_at: string
          data_handling: Json
          external_provider: boolean
          id: string
          limits: Json
          model_id: string
          pricing: Json
          provider_id: string
          provider_version: string
          template_id: string
          version: number
        }
        Insert: {
          admission_status: Database["api"]["Enums"]["provider_admission_status"]
          checksum_sha256: string
          created_at?: string
          data_handling: Json
          external_provider: boolean
          id?: string
          limits: Json
          model_id: string
          pricing: Json
          provider_id: string
          provider_version: string
          template_id: string
          version: number
        }
        Update: {
          admission_status?: Database["api"]["Enums"]["provider_admission_status"]
          checksum_sha256?: string
          created_at?: string
          data_handling?: Json
          external_provider?: boolean
          id?: string
          limits?: Json
          model_id?: string
          pricing?: Json
          provider_id?: string
          provider_version?: string
          template_id?: string
          version?: number
        }
        Relationships: []
      }
      report_artifacts: {
        Row: {
          artifact: Json
          content_sha256: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          run_id: string
          schema_version: string
        }
        Insert: {
          artifact: Json
          content_sha256: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          run_id: string
          schema_version: string
        }
        Update: {
          artifact?: Json
          content_sha256?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          run_id?: string
          schema_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_artifacts_run_foreign_key"
            columns: ["organization_id", "run_id"]
            isOneToOne: false
            referencedRelation: "simulation_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      report_exports: {
        Row: {
          content: string
          content_sha256: string
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_at: string
          filename: string
          format: Database["api"]["Enums"]["export_format"]
          id: string
          organization_id: string
          report_artifact_id: string
        }
        Insert: {
          content: string
          content_sha256: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_at: string
          filename: string
          format: Database["api"]["Enums"]["export_format"]
          id?: string
          organization_id: string
          report_artifact_id: string
        }
        Update: {
          content?: string
          content_sha256?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_at?: string
          filename?: string
          format?: Database["api"]["Enums"]["export_format"]
          id?: string
          organization_id?: string
          report_artifact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_report_foreign_key"
            columns: ["organization_id", "report_artifact_id"]
            isOneToOne: false
            referencedRelation: "report_artifacts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      report_share_grants: {
        Row: {
          access_count: number
          created_at: string
          created_by: string
          expires_at: string
          id: string
          last_accessed_at: string | null
          organization_id: string
          permission: Database["api"]["Enums"]["share_permission"]
          recipient_user_id: string
          report_artifact_id: string
          revoked_at: string | null
          token_sha256: string
        }
        Insert: {
          access_count?: number
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          last_accessed_at?: string | null
          organization_id: string
          permission: Database["api"]["Enums"]["share_permission"]
          recipient_user_id: string
          report_artifact_id: string
          revoked_at?: string | null
          token_sha256: string
        }
        Update: {
          access_count?: number
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          organization_id?: string
          permission?: Database["api"]["Enums"]["share_permission"]
          recipient_user_id?: string
          report_artifact_id?: string
          revoked_at?: string | null
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_share_grants_recipient_foreign_key"
            columns: ["organization_id", "recipient_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "report_share_grants_report_foreign_key"
            columns: ["organization_id", "report_artifact_id"]
            isOneToOne: false
            referencedRelation: "report_artifacts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      simulation_configuration_versions: {
        Row: {
          audience_version_id: string
          checksum_sha256: string
          cost_ceiling_microusd: number
          created_at: string
          created_by: string
          id: string
          methodology_version_id: string
          organization_id: string
          population_frame_version_id: string
          provider_configuration_version_id: string
          sampling_configuration: Json
          simulation_configuration_id: string
          version: number
        }
        Insert: {
          audience_version_id: string
          checksum_sha256: string
          cost_ceiling_microusd: number
          created_at?: string
          created_by: string
          id?: string
          methodology_version_id: string
          organization_id: string
          population_frame_version_id: string
          provider_configuration_version_id: string
          sampling_configuration: Json
          simulation_configuration_id: string
          version: number
        }
        Update: {
          audience_version_id?: string
          checksum_sha256?: string
          cost_ceiling_microusd?: number
          created_at?: string
          created_by?: string
          id?: string
          methodology_version_id?: string
          organization_id?: string
          population_frame_version_id?: string
          provider_configuration_version_id?: string
          sampling_configuration?: Json
          simulation_configuration_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulation_configuration_vers_provider_configuration_versi_fkey"
            columns: ["provider_configuration_version_id"]
            isOneToOne: false
            referencedRelation: "provider_configuration_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_configuration_versi_population_frame_version_id_fkey"
            columns: ["population_frame_version_id"]
            isOneToOne: false
            referencedRelation: "population_frame_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_configuration_versions_audience_version_id_fkey"
            columns: ["audience_version_id"]
            isOneToOne: false
            referencedRelation: "audience_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_configuration_versions_config_foreign_key"
            columns: ["organization_id", "simulation_configuration_id"]
            isOneToOne: false
            referencedRelation: "simulation_configurations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "simulation_configuration_versions_methodology_version_id_fkey"
            columns: ["methodology_version_id"]
            isOneToOne: false
            referencedRelation: "methodology_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_configurations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_configurations_project_foreign_key"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["organization_id", "id"]
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
          traceparent: string | null
          updated_at: string
          version: number
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
          traceparent?: string | null
          updated_at?: string
          version?: number
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
          traceparent?: string | null
          updated_at?: string
          version?: number
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
      variant_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_groups_project_foreign_key"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      variant_members: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string
          organization_id: string
          sort_order: number
          stimulus_version_id: string
          variant_group_id: string
          variant_key: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          label: string
          organization_id: string
          sort_order: number
          stimulus_version_id: string
          variant_group_id: string
          variant_key: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          organization_id?: string
          sort_order?: number
          stimulus_version_id?: string
          variant_group_id?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_members_group_foreign_key"
            columns: ["organization_id", "variant_group_id"]
            isOneToOne: false
            referencedRelation: "variant_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "variant_members_stimulus_version_foreign_key"
            columns: ["organization_id", "stimulus_version_id"]
            isOneToOne: false
            referencedRelation: "stimulus_versions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
      }
      access_shared_report: {
        Args: {
          requested_correlation_id: string
          requested_token_sha256: string
        }
        Returns: Json
      }
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
      create_audience_definition: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_limitations: string
          requested_manifest: Json
          requested_name: string
          requested_organization_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_feedback_record: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_kind: Database["api"]["Enums"]["feedback_kind"]
          requested_observed_at: string
          requested_organization_id: string
          requested_payload: Json
          requested_provenance: Json
          requested_rights_basis: string
          requested_run_id: string
          requested_sha256: string
        }
        Returns: Json
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
      create_organization_invitation: {
        Args: {
          requested_correlation_id: string
          requested_email: string
          requested_expires_at: string
          requested_idempotency_key: string
          requested_organization_id: string
          requested_role: Database["api"]["Enums"]["organization_role"]
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
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
      create_report_artifact: {
        Args: {
          requested_artifact: Json
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_run_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_report_export: {
        Args: {
          requested_content: string
          requested_correlation_id: string
          requested_expires_at: string
          requested_filename: string
          requested_format: Database["api"]["Enums"]["export_format"]
          requested_idempotency_key: string
          requested_report_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_report_share_grant: {
        Args: {
          requested_correlation_id: string
          requested_expires_at: string
          requested_idempotency_key: string
          requested_permission: Database["api"]["Enums"]["share_permission"]
          requested_recipient_user_id: string
          requested_report_id: string
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
      }
      create_simulation_configuration: {
        Args: {
          requested_audience_version_id: string
          requested_correlation_id: string
          requested_cost_ceiling_microusd: number
          requested_idempotency_key: string
          requested_methodology_version_id: string
          requested_name: string
          requested_population_frame_version_id: string
          requested_project_id: string
          requested_provider_configuration_version_id: string
          requested_sampling_configuration: Json
          requested_sha256: string
        }
        Returns: Json
      }
      create_simulation_run:
        | {
            Args: {
              requested_correlation_id: string
              requested_idempotency_key: string
              requested_project_id: string
              requested_sha256: string
              requested_stimulus_version_id: string
            }
            Returns: {
              audience_version_id: string
              created_at: string
              dispatch_generation: number
              job_id: string
              organization_id: string
              project_id: string
              replayed: boolean
              run_id: string
              run_state: Database["api"]["Enums"]["run_state"]
              run_version: number
              schema_version: number
              stimulus_version_id: string
            }[]
          }
        | {
            Args: {
              requested_correlation_id: string
              requested_idempotency_key: string
              requested_project_id: string
              requested_sha256: string
              requested_stimulus_version_id: string
              requested_traceparent: string
            }
            Returns: {
              audience_version_id: string
              created_at: string
              dispatch_generation: number
              job_id: string
              organization_id: string
              project_id: string
              replayed: boolean
              run_id: string
              run_state: Database["api"]["Enums"]["run_state"]
              run_version: number
              schema_version: number
              stimulus_version_id: string
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
      create_variant_group: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_members: Json
          requested_name: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      get_organization_admin_summary: {
        Args: { requested_organization_id: string }
        Returns: Json
      }
      get_organization_audit_feed: {
        Args: { requested_limit?: number; requested_organization_id: string }
        Returns: Json
      }
      get_run_failure_context: {
        Args: { requested_run_id: string }
        Returns: {
          correlation_id: string
          terminal_error_code: string
        }[]
      }
      get_simulation_run_replay: {
        Args: {
          requested_idempotency_key: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
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
      record_privileged_denial: {
        Args: {
          requested_action: string
          requested_correlation_id: string
          requested_object_id: string
          requested_object_type: string
          requested_organization_id: string
        }
        Returns: undefined
      }
      record_sign_in_success: {
        Args: { requested_correlation_id: string; requested_session_id: string }
        Returns: boolean
      }
      request_run_cancel: {
        Args: { requested_correlation_id: string; requested_run_id: string }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
        }[]
      }
      revoke_report_share_grant: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_share_id: string
        }
        Returns: Json
      }
      set_feature_flag: {
        Args: {
          requested_correlation_id: string
          requested_enabled: boolean
          requested_flag_key: string
          requested_idempotency_key: string
          requested_organization_id: string
          requested_reason: string
          requested_sha256: string
        }
        Returns: Json
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
      audience_admission_status:
        | "approved_demo"
        | "revoked"
        | "approved_experimental"
      audience_kind: "authored_demo" | "synthetic_cohort"
      evaluation_status: "completed" | "failed" | "superseded"
      export_format: "json" | "csv"
      feedback_kind:
        | "human_panel"
        | "survey"
        | "focus_group"
        | "campaign_outcome"
        | "user_correction"
        | "post_launch_sentiment"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      organization_role: "owner" | "editor" | "viewer"
      organization_status: "active" | "disabled" | "deleted"
      project_status: "active" | "archived" | "deleted"
      provider_admission_status:
        | "approved_demo"
        | "approved_external"
        | "disabled"
        | "retired"
      run_state:
        | "queued"
        | "running"
        | "retrying"
        | "cancel_requested"
        | "canceled"
        | "succeeded"
        | "failed"
      share_permission: "view" | "download"
      stimulus_status: "active" | "retired" | "deleted"
      validation_status:
        | "experimental"
        | "benchmarked"
        | "calibrated"
        | "retired"
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
          outcome: string
          source_service: string
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
          outcome?: string
          source_service?: string
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
          outcome?: string
          source_service?: string
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
      phase4_command_receipts: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          idempotency_key: string
          organization_id: string
          request_sha256: string
          resource_id: string | null
          response: Json | null
          scope: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          organization_id: string
          request_sha256: string
          resource_id?: string | null
          response?: Json | null
          scope: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          request_sha256?: string
          resource_id?: string | null
          response?: Json | null
          scope?: string
        }
        Relationships: []
      }
      provider_success_receipts: {
        Row: {
          artifact_sha256: string
          attempt_id: string
          cost_microusd: number
          created_at: string
          ended_at: string
          finish_status: string
          input_tokens: number
          model_id: string
          organization_id: string
          output_tokens: number
          provider_id: string
          provider_version: number
          receipt_kind: string
          receipt_sha256: string
          receipt_version: number
          request_id: string
          response_schema_version: number
          run_id: string
          safe_error_class: string | null
          started_at: string
          template_id: string
        }
        Insert: {
          artifact_sha256: string
          attempt_id: string
          cost_microusd: number
          created_at?: string
          ended_at: string
          finish_status: string
          input_tokens: number
          model_id: string
          organization_id: string
          output_tokens: number
          provider_id: string
          provider_version: number
          receipt_kind: string
          receipt_sha256: string
          receipt_version: number
          request_id: string
          response_schema_version: number
          run_id: string
          safe_error_class?: string | null
          started_at: string
          template_id: string
        }
        Update: {
          artifact_sha256?: string
          attempt_id?: string
          cost_microusd?: number
          created_at?: string
          ended_at?: string
          finish_status?: string
          input_tokens?: number
          model_id?: string
          organization_id?: string
          output_tokens?: number
          provider_id?: string
          provider_version?: number
          receipt_kind?: string
          receipt_sha256?: string
          receipt_version?: number
          request_id?: string
          response_schema_version?: number
          run_id?: string
          safe_error_class?: string | null
          started_at?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_success_receipts_attempt_foreign_key"
            columns: ["organization_id", "run_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "run_attempts"
            referencedColumns: ["organization_id", "run_id", "id"]
          },
        ]
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
      runtime_controls: {
        Row: {
          control_name: string
          correlation_id: string
          enabled: boolean
          reason: string | null
          updated_at: string
        }
        Insert: {
          control_name: string
          correlation_id: string
          enabled: boolean
          reason?: string | null
          updated_at?: string
        }
        Update: {
          control_name?: string
          correlation_id?: string
          enabled?: boolean
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
      }
      access_shared_report_atomic: {
        Args: {
          requested_correlation_id: string
          requested_token_sha256: string
        }
        Returns: Json
      }
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
      begin_phase4_command: {
        Args: {
          requested_idempotency_key: string
          requested_organization_id: string
          requested_scope: string
          requested_sha256: string
        }
        Returns: {
          existing_response: Json
          receipt_id: string
          replayed: boolean
        }[]
      }
      claim_due_run_outbox: {
        Args: { requested_batch_size: number }
        Returns: {
          claim_expires_at: string
          claim_token: string
          generation: number
          job_id: string
          outbox_id: string
          run_id: string
        }[]
      }
      claim_run_execution: {
        Args: {
          requested_generation: number
          requested_job_id: string
          requested_run_id: string
        }
        Returns: {
          attempt_id: string
          claim_status: string
          deterministic_seed: number
          frozen_manifest: Json
          frozen_manifest_sha256: string
          lease_expires_at: string
          lease_token: string
        }[]
      }
      claim_run_execution_traced: {
        Args: {
          requested_generation: number
          requested_job_id: string
          requested_run_id: string
        }
        Returns: {
          attempt_id: string
          claim_status: string
          correlation_id: string
          deterministic_seed: number
          frozen_manifest: Json
          frozen_manifest_sha256: string
          lease_expires_at: string
          lease_token: string
          traceparent: string
        }[]
      }
      complete_run_execution:
        | {
            Args: {
              requested_artifact: Json
              requested_attempt_id: string
              requested_lease_token: string
              requested_run_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              requested_artifact: Json
              requested_attempt_id: string
              requested_lease_token: string
              requested_receipt: Json
              requested_run_id: string
            }
            Returns: boolean
          }
      confirm_run_dispatch: {
        Args: { requested_claim_token: string; requested_outbox_id: string }
        Returns: boolean
      }
      create_audience_definition_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_limitations: string
          requested_manifest: Json
          requested_name: string
          requested_organization_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_feedback_record_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_kind: Database["api"]["Enums"]["feedback_kind"]
          requested_observed_at: string
          requested_organization_id: string
          requested_payload: Json
          requested_provenance: Json
          requested_rights_basis: string
          requested_run_id: string
          requested_sha256: string
        }
        Returns: Json
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
      create_organization_invitation_atomic: {
        Args: {
          requested_correlation_id: string
          requested_email: string
          requested_expires_at: string
          requested_idempotency_key: string
          requested_organization_id: string
          requested_role: Database["api"]["Enums"]["organization_role"]
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
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
      create_report_artifact_atomic: {
        Args: {
          requested_artifact: Json
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_run_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_report_export_atomic: {
        Args: {
          requested_content: string
          requested_correlation_id: string
          requested_expires_at: string
          requested_filename: string
          requested_format: Database["api"]["Enums"]["export_format"]
          requested_idempotency_key: string
          requested_report_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      create_report_share_grant_atomic: {
        Args: {
          requested_correlation_id: string
          requested_expires_at: string
          requested_idempotency_key: string
          requested_permission: Database["api"]["Enums"]["share_permission"]
          requested_recipient_user_id: string
          requested_report_id: string
          requested_sha256: string
          requested_token_sha256: string
        }
        Returns: Json
      }
      create_simulation_configuration_atomic: {
        Args: {
          requested_audience_version_id: string
          requested_correlation_id: string
          requested_cost_ceiling_microusd: number
          requested_idempotency_key: string
          requested_methodology_version_id: string
          requested_name: string
          requested_population_frame_version_id: string
          requested_project_id: string
          requested_provider_configuration_version_id: string
          requested_sampling_configuration: Json
          requested_sha256: string
        }
        Returns: Json
      }
      create_simulation_run_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_project_id: string
          requested_sha256: string
          requested_stimulus_version_id: string
        }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          replayed: boolean
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
        }[]
      }
      create_simulation_run_traced: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_project_id: string
          requested_sha256: string
          requested_stimulus_version_id: string
          requested_traceparent: string
        }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          replayed: boolean
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
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
      create_variant_group_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_members: Json
          requested_name: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: Json
      }
      evaluate_run_creation_control: {
        Args: {
          requested_poisoned_count: number
          requested_redis_memory_percent: number
        }
        Returns: {
          alert_reason: string
          changed: boolean
          run_creation_enabled: boolean
        }[]
      }
      fail_run_dispatch: {
        Args: {
          requested_claim_token: string
          requested_outbox_id: string
          requested_safe_error_code: string
        }
        Returns: boolean
      }
      fail_run_execution: {
        Args: {
          requested_attempt_id: string
          requested_lease_token: string
          requested_retryable: boolean
          requested_run_id: string
          requested_safe_error_code: string
        }
        Returns: string
      }
      finalize_poisoned_dispatches: {
        Args: { requested_batch_size: number }
        Returns: number
      }
      finalize_requested_cancellations: {
        Args: { requested_batch_size: number }
        Returns: number
      }
      finish_phase4_command: {
        Args: {
          requested_receipt_id: string
          requested_resource_id: string
          requested_response: Json
        }
        Returns: undefined
      }
      get_run_creation_control: {
        Args: never
        Returns: {
          control_name: string
          correlation_id: string
          enabled: boolean
          reason: string
          updated_at: string
        }[]
      }
      get_run_failure_context: {
        Args: { requested_run_id: string }
        Returns: {
          correlation_id: string
          terminal_error_code: string
        }[]
      }
      get_simulation_run_replay: {
        Args: {
          requested_idempotency_key: string
          requested_project_id: string
          requested_sha256: string
        }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
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
      heartbeat_run_execution: {
        Args: {
          requested_attempt_id: string
          requested_lease_token: string
          requested_run_id: string
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
      latch_run_creation_for_poison: { Args: never; Returns: boolean }
      organization_admin_summary: {
        Args: { requested_organization_id: string }
        Returns: Json
      }
      organization_audit_feed: {
        Args: { requested_limit?: number; requested_organization_id: string }
        Returns: Json
      }
      phase2_provider_success_receipt_is_valid: {
        Args: {
          requested_artifact: Json
          requested_attempt_id: string
          requested_receipt: Json
          requested_run_id: string
        }
        Returns: boolean
      }
      phase2_result_artifact_is_valid: {
        Args: {
          requested_artifact: Json
          requested_deterministic_seed: number
          requested_frozen_manifest_sha256: string
          requested_run_id: string
        }
        Returns: boolean
      }
      provider_success_receipt_for_run: {
        Args: { requested_run_id: string }
        Returns: {
          cost_microusd: number
          ended_at: string
          finish_status: string
          input_tokens: number
          model_id: string
          output_tokens: number
          provider_id: string
          provider_version: number
          receipt_kind: string
          receipt_version: number
          response_schema_version: number
          safe_error_class: string
          started_at: string
          template_id: string
        }[]
      }
      reconcile_run_dispatch: {
        Args: {
          requested_batch_size: number
          requested_force_recovery: boolean
        }
        Returns: number
      }
      record_privileged_denial_atomic: {
        Args: {
          requested_action: string
          requested_correlation_id: string
          requested_object_id: string
          requested_object_type: string
          requested_organization_id: string
        }
        Returns: undefined
      }
      record_sign_in_success: {
        Args: { requested_correlation_id: string; requested_session_id: string }
        Returns: boolean
      }
      request_run_cancel_atomic: {
        Args: { requested_correlation_id: string; requested_run_id: string }
        Returns: {
          audience_version_id: string
          created_at: string
          dispatch_generation: number
          job_id: string
          organization_id: string
          project_id: string
          run_id: string
          run_state: Database["api"]["Enums"]["run_state"]
          run_version: number
          schema_version: number
          stimulus_version_id: string
        }[]
      }
      revoke_report_share_grant_atomic: {
        Args: {
          requested_correlation_id: string
          requested_idempotency_key: string
          requested_sha256: string
          requested_share_id: string
        }
        Returns: Json
      }
      runtime_observability_snapshot: {
        Args: never
        Returns: {
          cancel_requested_count: number
          canceled_count: number
          failed_count: number
          migration_version: number
          oldest_cancel_requested_age_seconds: number
          queued_count: number
          retrying_count: number
          rls_force_enabled: boolean
          running_count: number
          stuck_lease_count: number
          succeeded_count: number
        }[]
      }
      set_feature_flag_atomic: {
        Args: {
          requested_correlation_id: string
          requested_enabled: boolean
          requested_flag_key: string
          requested_idempotency_key: string
          requested_organization_id: string
          requested_reason: string
          requested_sha256: string
        }
        Returns: Json
      }
      set_run_creation_control: {
        Args: {
          requested_correlation_id: string
          requested_enabled: boolean
          requested_reason: string
        }
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
      audience_admission_status: [
        "approved_demo",
        "revoked",
        "approved_experimental",
      ],
      audience_kind: ["authored_demo", "synthetic_cohort"],
      evaluation_status: ["completed", "failed", "superseded"],
      export_format: ["json", "csv"],
      feedback_kind: [
        "human_panel",
        "survey",
        "focus_group",
        "campaign_outcome",
        "user_correction",
        "post_launch_sentiment",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      organization_role: ["owner", "editor", "viewer"],
      organization_status: ["active", "disabled", "deleted"],
      project_status: ["active", "archived", "deleted"],
      provider_admission_status: [
        "approved_demo",
        "approved_external",
        "disabled",
        "retired",
      ],
      run_state: [
        "queued",
        "running",
        "retrying",
        "cancel_requested",
        "canceled",
        "succeeded",
        "failed",
      ],
      share_permission: ["view", "download"],
      stimulus_status: ["active", "retired", "deleted"],
      validation_status: [
        "experimental",
        "benchmarked",
        "calibrated",
        "retired",
      ],
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

