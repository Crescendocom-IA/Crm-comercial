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
      activities: {
        Row: {
          body: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_instance_assignments: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_instance_assignments_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_instance_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_status: {
        Row: {
          auto_assign: boolean
          created_at: string
          current_channel_focus: string | null
          current_load: number
          id: string
          last_assigned_at: string | null
          last_seen_at: string
          org_id: string
          status: Database["public"]["Enums"]["agent_status_kind"]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_assign?: boolean
          created_at?: string
          current_channel_focus?: string | null
          current_load?: number
          id?: string
          last_assigned_at?: string | null
          last_seen_at?: string
          org_id: string
          status?: Database["public"]["Enums"]["agent_status_kind"]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_assign?: boolean
          created_at?: string
          current_channel_focus?: string | null
          current_load?: number
          id?: string
          last_assigned_at?: string | null
          last_seen_at?: string
          org_id?: string
          status?: Database["public"]["Enums"]["agent_status_kind"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          request_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          org_id: string
          request_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          request_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          org_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          org_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          actions_result: Json | null
          automation_id: string
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          org_id: string
          status: string
          trigger_payload: Json | null
        }
        Insert: {
          actions_result?: Json | null
          automation_id: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id: string
          status?: string
          trigger_payload?: Json | null
        }
        Update: {
          actions_result?: Json | null
          automation_id?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id?: string
          status?: string
          trigger_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          org_id: string
          run_count: number | null
          trigger: Json
          updated_at: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          org_id: string
          run_count?: number | null
          trigger?: Json
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          org_id?: string
          run_count?: number | null
          trigger?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          external_id: string | null
          id: string
          org_id: string
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          to_address: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          org_id: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          to_address: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          org_id?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          to_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          channel_id: string | null
          channel_type: Database["public"]["Enums"]["omni_channel_type"]
          created_at: string
          created_by: string | null
          id: string
          media_url: string | null
          message: string | null
          name: string
          org_id: string
          rate_per_hour: number
          schedule_at: string | null
          stats: Json
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          channel_id?: string | null
          channel_type: Database["public"]["Enums"]["omni_channel_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          media_url?: string | null
          message?: string | null
          name: string
          org_id: string
          rate_per_hour?: number
          schedule_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["omni_channel_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          media_url?: string | null
          message?: string | null
          name?: string
          org_id?: string
          rate_per_hour?: number
          schedule_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          provider: Database["public"]["Enums"]["omni_provider"]
          type: Database["public"]["Enums"]["omni_channel_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          provider: Database["public"]["Enums"]["omni_provider"]
          type: Database["public"]["Enums"]["omni_channel_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          provider?: Database["public"]["Enums"]["omni_provider"]
          type?: Database["public"]["Enums"]["omni_channel_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          domain: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          org_id: string
          owner_id: string | null
          revenue: number | null
          size: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          org_id: string
          owner_id?: string | null
          revenue?: number | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          revenue?: number | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          lead_score: number | null
          linkedin_url: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          status: Database["public"]["Enums"]["contact_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_events: {
        Row: {
          actor: string
          contract_id: string
          created_at: string
          geo: Json | null
          id: string
          ip: string | null
          metadata: Json
          type: string
          user_agent: string | null
        }
        Insert: {
          actor?: string
          contract_id: string
          created_at?: string
          geo?: Json | null
          id?: string
          ip?: string | null
          metadata?: Json
          type: string
          user_agent?: string | null
        }
        Update: {
          actor?: string
          contract_id?: string
          created_at?: string
          geo?: Json | null
          id?: string
          ip?: string | null
          metadata?: Json
          type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          consent_text: string | null
          contract_id: string
          created_at: string
          geolocation: Json | null
          id: string
          ip: string | null
          signature_image_url: string | null
          signature_method: string
          signed_at: string
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          consent_text?: string | null
          contract_id: string
          created_at?: string
          geolocation?: Json | null
          id?: string
          ip?: string | null
          signature_image_url?: string | null
          signature_method?: string
          signed_at?: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string | null
          contract_id?: string
          created_at?: string
          geolocation?: Json | null
          id?: string
          ip?: string | null
          signature_image_url?: string | null
          signature_method?: string
          signed_at?: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_message: string | null
          description: string | null
          file_url: string | null
          id: string
          name: string
          org_id: string
          signer_fields: Json
          storage_path: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_message?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          name: string
          org_id: string
          signer_fields?: Json
          storage_path?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_message?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          name?: string
          org_id?: string
          signer_fields?: Json
          storage_path?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          expires_at: string | null
          file_url: string | null
          first_viewed_at: string | null
          id: string
          message: string | null
          org_id: string
          public_slug: string
          sent_at: string | null
          sent_via: string | null
          signature_hash: string | null
          signed_at: string | null
          signed_file_url: string | null
          signed_storage_path: string | null
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          status: string
          storage_path: string | null
          template_id: string | null
          title: string
          updated_at: string
          variables: Json
          view_count: number
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          expires_at?: string | null
          file_url?: string | null
          first_viewed_at?: string | null
          id?: string
          message?: string | null
          org_id: string
          public_slug?: string
          sent_at?: string | null
          sent_via?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          signed_storage_path?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
          storage_path?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          variables?: Json
          view_count?: number
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          expires_at?: string | null
          file_url?: string | null
          first_viewed_at?: string | null
          id?: string
          message?: string | null
          org_id?: string
          public_slug?: string
          sent_at?: string | null
          sent_via?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          signed_storage_path?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
          storage_path?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          variables?: Json
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          contact_id: string | null
          conversation_id: string
          created_at: string
          deal_id: string | null
          generated_at: string
          id: string
          key_points: Json
          message_count_at_generation: number
          model_used: string | null
          org_id: string
          pending_actions: Json
          sentiment: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id: string
          created_at?: string
          deal_id?: string | null
          generated_at?: string
          id?: string
          key_points?: Json
          message_count_at_generation?: number
          model_used?: string | null
          org_id: string
          pending_actions?: Json
          sentiment?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string
          created_at?: string
          deal_id?: string | null
          generated_at?: string
          id?: string
          key_points?: Json
          message_count_at_generation?: number
          model_used?: string | null
          org_id?: string
          pending_actions?: Json
          sentiment?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_summaries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_summaries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_transfers: {
        Row: {
          conversation_id: string
          created_at: string
          from_agent_id: string | null
          id: string
          org_id: string
          performed_by: string | null
          reason: string | null
          to_agent_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_agent_id?: string | null
          id?: string
          org_id: string
          performed_by?: string | null
          reason?: string | null
          to_agent_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_agent_id?: string | null
          id?: string
          org_id?: string
          performed_by?: string | null
          reason?: string | null
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_order: number | null
          field_type: string
          id: string
          is_required: boolean | null
          options: Json | null
          org_id: string
          show_in_card: boolean | null
          show_in_table: boolean | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_order?: number | null
          field_type: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          org_id: string
          show_in_card?: boolean | null
          show_in_table?: boolean | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          field_key?: string
          field_label?: string
          field_order?: number | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          org_id?: string
          show_in_card?: boolean | null
          show_in_table?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tags: {
        Row: {
          deal_id: string
          tag_id: string
        }
        Insert: {
          deal_id: string
          tag_id: string
        }
        Update: {
          deal_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_tags_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          loss_reason: string | null
          org_id: string
          owner_id: string | null
          probability: number | null
          qualification: Json | null
          qualification_score: number | null
          stage_id: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          loss_reason?: string | null
          org_id: string
          owner_id?: string | null
          probability?: number | null
          qualification?: Json | null
          qualification_score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          loss_reason?: string | null
          org_id?: string
          owner_id?: string | null
          probability?: number | null
          qualification?: Json | null
          qualification_score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_connections: {
        Row: {
          connected_at: string | null
          email_address: string
          id: string
          is_active: boolean | null
          org_id: string
          provider: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          email_address: string
          id?: string
          is_active?: boolean | null
          org_id: string
          provider: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          email_address?: string
          id?: string
          is_active?: boolean | null
          org_id?: string
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          current_step: number | null
          enrolled_at: string | null
          id: string
          next_send_at: string | null
          org_id: string
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          org_id: string
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          org_id?: string
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          body_html: string | null
          created_at: string | null
          delay_days: number
          id: string
          org_id: string
          sequence_id: string
          step_order: number
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string | null
          delay_days?: number
          id?: string
          org_id: string
          sequence_id: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body_html?: string | null
          created_at?: string | null
          delay_days?: number
          id?: string
          org_id?: string
          sequence_id?: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          created_at: string | null
          html: string
          id: string
          is_default: boolean | null
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          html?: string
          id?: string
          is_default?: boolean | null
          name?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          html?: string
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          bcc_emails: Json | null
          body_html: string | null
          cc_emails: Json | null
          click_count: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          direction: string
          from_email: string | null
          id: string
          is_archived: boolean | null
          is_read: boolean | null
          last_clicked_at: string | null
          last_opened_at: string | null
          message_id: string | null
          open_count: number | null
          org_id: string
          provider: string | null
          sent_at: string | null
          snoozed_until: string | null
          status: string
          subject: string | null
          thread_id: string | null
          to_emails: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bcc_emails?: Json | null
          body_html?: string | null
          cc_emails?: Json | null
          click_count?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id?: string | null
          open_count?: number | null
          org_id: string
          provider?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bcc_emails?: Json | null
          body_html?: string | null
          cc_emails?: Json | null
          click_count?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id?: string | null
          open_count?: number | null
          org_id?: string
          provider?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_automation_logs: {
        Row: {
          action: string | null
          comment_id: string | null
          created_at: string
          id: string
          org_id: string
          payload: Json | null
          result: string | null
          rule_id: string
          user_handle: string | null
        }
        Insert: {
          action?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          payload?: Json | null
          result?: string | null
          rule_id: string
          user_handle?: string | null
        }
        Update: {
          action?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json | null
          result?: string | null
          rule_id?: string
          user_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_automation_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ig_automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ig_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_automation_rules: {
        Row: {
          channel_id: string | null
          created_at: string
          dm_template: string | null
          enabled: boolean
          id: string
          keywords: string[]
          match_mode: Database["public"]["Enums"]["ig_match_mode"]
          name: string
          org_id: string
          post_id: string | null
          reply_template: string | null
          trigger_type: Database["public"]["Enums"]["ig_trigger_type"]
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          dm_template?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          match_mode?: Database["public"]["Enums"]["ig_match_mode"]
          name: string
          org_id: string
          post_id?: string | null
          reply_template?: string | null
          trigger_type?: Database["public"]["Enums"]["ig_trigger_type"]
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          dm_template?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          match_mode?: Database["public"]["Enums"]["ig_match_mode"]
          name?: string
          org_id?: string
          post_id?: string | null
          reply_template?: string | null
          trigger_type?: Database["public"]["Enums"]["ig_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ig_automation_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ig_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          config: Json
          connected_at: string | null
          connected_by: string | null
          id: string
          is_active: boolean | null
          org_id: string
          provider: string
        }
        Insert: {
          config?: Json
          connected_at?: string | null
          connected_by?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          provider: string
        }
        Update: {
          config?: Json
          connected_at?: string | null
          connected_by?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          helpful_count: number
          id: string
          is_published: boolean
          org_id: string
          slug: string
          tags: string[]
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          helpful_count?: number
          id?: string
          is_published?: boolean
          org_id: string
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          helpful_count?: number
          id?: string
          is_published?: boolean
          org_id?: string
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_history: {
        Row: {
          contact_id: string
          created_at: string | null
          event_type: string | null
          id: string
          org_id: string
          points: number
          reason: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          event_type?: string | null
          id?: string
          org_id: string
          points: number
          reason: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          event_type?: string | null
          id?: string
          org_id?: string
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_rules: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          is_active: boolean | null
          label: string
          org_id: string
          points: number
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean | null
          label: string
          org_id: string
          points?: number
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          label?: string
          org_id?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      livecoach_playbooks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          triggers: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          triggers?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          triggers?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "livecoach_playbooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      livecoach_sessions: {
        Row: {
          contact_id: string | null
          created_at: string
          deal_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          feedback: string | null
          id: string
          org_id: string
          playbook_id: string | null
          score_closing: number | null
          score_discovery: number | null
          score_objections: number | null
          score_overall: number | null
          score_pitch: number | null
          score_rapport: number | null
          started_at: string
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          id?: string
          org_id: string
          playbook_id?: string | null
          score_closing?: number | null
          score_discovery?: number | null
          score_objections?: number | null
          score_overall?: number | null
          score_pitch?: number | null
          score_rapport?: number | null
          started_at?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          id?: string
          org_id?: string
          playbook_id?: string | null
          score_closing?: number | null
          score_discovery?: number | null
          score_objections?: number | null
          score_overall?: number | null
          score_pitch?: number | null
          score_rapport?: number | null
          started_at?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "livecoach_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livecoach_sessions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livecoach_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livecoach_sessions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "livecoach_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      livecoach_tips: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          session_id: string
          title: string
          trigger_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          message: string
          session_id: string
          title: string
          trigger_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          session_id?: string
          title?: string
          trigger_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livecoach_tips_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "livecoach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      livecoach_transcripts: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          sequence: number
          session_id: string
          speaker: string | null
          started_at: string
          text: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          sequence: number
          session_id: string
          speaker?: string | null
          started_at?: string
          text: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          sequence?: number
          session_id?: string
          speaker?: string | null
          started_at?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "livecoach_transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "livecoach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      loss_reasons: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          org_id: string
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          org_id: string
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          org_id?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loss_reasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_links: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          meeting_id: string
          title: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          meeting_id: string
          title: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          meeting_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_links_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_links_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_minutes: {
        Row: {
          action_items: Json
          approved_at: string | null
          approved_by: string | null
          created_at: string
          generated_at: string
          id: string
          key_decisions: Json
          meeting_id: string
          open_questions: Json
          summary: string | null
          updated_at: string
        }
        Insert: {
          action_items?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          key_decisions?: Json
          meeting_id: string
          open_questions?: Json
          summary?: string | null
          updated_at?: string
        }
        Update: {
          action_items?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          key_decisions?: Json
          meeting_id?: string
          open_questions?: Json
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          created_at: string
          email: string
          id: string
          invite_sent_at: string | null
          joined_at: string | null
          meeting_id: string
          name: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invite_sent_at?: string | null
          joined_at?: string | null
          meeting_id: string
          name?: string | null
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invite_sent_at?: string | null
          joined_at?: string | null
          meeting_id?: string
          name?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_transcripts: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          meeting_id: string
          sequence: number
          speaker: string | null
          started_at: string
          text: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          meeting_id: string
          sequence: number
          speaker?: string | null
          started_at?: string
          text: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          meeting_id?: string
          sequence?: number
          speaker?: string | null
          started_at?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          daily_room_name: string | null
          daily_room_url: string | null
          deal_id: string | null
          description: string | null
          duration_min: number
          ended_at: string | null
          host_user_id: string
          id: string
          org_id: string
          recording_url: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_room_name?: string | null
          daily_room_url?: string | null
          deal_id?: string | null
          description?: string | null
          duration_min?: number
          ended_at?: string | null
          host_user_id: string
          id?: string
          org_id: string
          recording_url?: string | null
          scheduled_at: string
          started_at?: string | null
          status?: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_room_name?: string | null
          daily_room_url?: string | null
          deal_id?: string | null
          description?: string | null
          duration_min?: number
          ended_at?: string | null
          host_user_id?: string
          id?: string
          org_id?: string
          recording_url?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          daily_summary: boolean | null
          daily_summary_hour: number | null
          email_daily_summary: boolean | null
          email_deal_won: boolean | null
          email_task_overdue: boolean | null
          id: string
          notify_assignment: boolean | null
          notify_deal_lost: boolean | null
          notify_deal_won: boolean | null
          notify_mention: boolean | null
          notify_task_overdue: boolean | null
          org_id: string
          user_id: string
        }
        Insert: {
          daily_summary?: boolean | null
          daily_summary_hour?: number | null
          email_daily_summary?: boolean | null
          email_deal_won?: boolean | null
          email_task_overdue?: boolean | null
          id?: string
          notify_assignment?: boolean | null
          notify_deal_lost?: boolean | null
          notify_deal_won?: boolean | null
          notify_mention?: boolean | null
          notify_task_overdue?: boolean | null
          org_id: string
          user_id: string
        }
        Update: {
          daily_summary?: boolean | null
          daily_summary_hour?: number | null
          email_daily_summary?: boolean | null
          email_deal_won?: boolean | null
          email_task_overdue?: boolean | null
          id?: string
          notify_assignment?: boolean | null
          notify_deal_lost?: boolean | null
          notify_deal_won?: boolean | null
          notify_mention?: boolean | null
          notify_task_overdue?: boolean | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_conversations: {
        Row: {
          assigned_agent_id: string | null
          channel_id: string
          channel_type: Database["public"]["Enums"]["omni_channel_type"]
          contact_id: string | null
          created_at: string
          deal_id: string | null
          external_thread_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          metadata: Json
          org_id: string
          priority: number
          status: Database["public"]["Enums"]["omni_conv_status"]
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          channel_id: string
          channel_type: Database["public"]["Enums"]["omni_channel_type"]
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          org_id: string
          priority?: number
          status?: Database["public"]["Enums"]["omni_conv_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          channel_id?: string
          channel_type?: Database["public"]["Enums"]["omni_channel_type"]
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          org_id?: string
          priority?: number
          status?: Database["public"]["Enums"]["omni_conv_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["omni_msg_direction"]
          external_id: string | null
          id: string
          media_url: string | null
          metadata: Json
          org_id: string
          sender_external_id: string | null
          sender_name: string | null
          sent_at: string
          status: string | null
          transcript: string | null
          type: Database["public"]["Enums"]["omni_msg_type"]
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["omni_msg_direction"]
          external_id?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          org_id: string
          sender_external_id?: string | null
          sender_name?: string | null
          sent_at?: string
          status?: string | null
          transcript?: string | null
          type?: Database["public"]["Enums"]["omni_msg_type"]
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["omni_msg_direction"]
          external_id?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          org_id?: string
          sender_external_id?: string | null
          sender_name?: string | null
          sent_at?: string
          status?: string | null
          transcript?: string | null
          type?: Database["public"]["Enums"]["omni_msg_type"]
        }
        Relationships: [
          {
            foreignKeyName: "omni_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "omni_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed: boolean | null
          contact_created: boolean | null
          created_at: string | null
          deal_created: boolean | null
          demo_loaded: boolean | null
          dismissed_at: string | null
          email_connected: boolean | null
          id: string
          member_invited: boolean | null
          org_id: string
          pipeline_created: boolean | null
          profile_configured: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          contact_created?: boolean | null
          created_at?: string | null
          deal_created?: boolean | null
          demo_loaded?: boolean | null
          dismissed_at?: string | null
          email_connected?: boolean | null
          id?: string
          member_invited?: boolean | null
          org_id: string
          pipeline_created?: boolean | null
          profile_configured?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          contact_created?: boolean | null
          created_at?: string | null
          deal_created?: boolean | null
          demo_loaded?: boolean | null
          dismissed_at?: string | null
          email_connected?: boolean | null
          id?: string
          member_invited?: boolean | null
          org_id?: string
          pipeline_created?: boolean | null
          profile_configured?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_secrets: {
        Row: {
          created_at: string | null
          id: string
          key_name: string
          key_value: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_name: string
          key_value: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_name?: string
          key_value?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          settings: Json | null
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string | null
          settings?: Json | null
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string | null
          settings?: Json | null
          slug?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          order: number
          org_id: string
          pipeline_id: string
          win_probability: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          order?: number
          org_id: string
          pipeline_id: string
          win_probability?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          order?: number
          org_id?: string
          pipeline_id?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          is_default: boolean | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_analyses: {
        Row: {
          adherence_score: number | null
          created_at: string
          criteria: Json
          detected_objections: Json
          fireflies_id: string | null
          id: string
          insights: Json
          meeting_id: string | null
          org_id: string
          playbook_id: string
          source: string
          summary: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adherence_score?: number | null
          created_at?: string
          criteria?: Json
          detected_objections?: Json
          fireflies_id?: string | null
          id?: string
          insights?: Json
          meeting_id?: string | null
          org_id: string
          playbook_id: string
          source?: string
          summary?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adherence_score?: number | null
          created_at?: string
          criteria?: Json
          detected_objections?: Json
          fireflies_id?: string | null
          id?: string
          insights?: Json
          meeting_id?: string | null
          org_id?: string
          playbook_id?: string
          source?: string
          summary?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_analyses_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_analyses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_analyses_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_objections: {
        Row: {
          category: string
          created_at: string
          frequency: number
          id: string
          objection: string
          org_id: string
          playbook_id: string
          response: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          frequency?: number
          id?: string
          objection: string
          org_id: string
          playbook_id: string
          response: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          frequency?: number
          id?: string
          objection?: string
          org_id?: string
          playbook_id?: string
          response?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_objections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_objections_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_scripts: {
        Row: {
          channel: string
          content: string | null
          created_at: string
          flow: Json
          id: string
          org_id: string
          playbook_id: string
          position: number
          stage: string
          title: string
          updated_at: string
        }
        Insert: {
          channel: string
          content?: string | null
          created_at?: string
          flow?: Json
          id?: string
          org_id: string
          playbook_id: string
          position?: number
          stage: string
          title: string
          updated_at?: string
        }
        Update: {
          channel?: string
          content?: string | null
          created_at?: string
          flow?: Json
          id?: string
          org_id?: string
          playbook_id?: string
          position?: number
          stage?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_scripts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_scripts_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          ai_prompt: string | null
          content: Json
          created_at: string
          created_by: string | null
          description: string | null
          funnel: Json
          generated_at: string | null
          id: string
          name: string
          org_id: string
          questionnaire: Json
          status: string
          updated_at: string
        }
        Insert: {
          ai_prompt?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          funnel?: Json
          generated_at?: string | null
          id?: string
          name: string
          org_id: string
          questionnaire?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          ai_prompt?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          funnel?: Json
          generated_at?: string | null
          id?: string
          name?: string
          org_id?: string
          questionnaire?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          org_id: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          proposal_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          proposal_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          proposal_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_followups: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          org_id: string
          proposal_id: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          template: string
          trigger: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          org_id: string
          proposal_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template: string
          trigger: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string
          proposal_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_followups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_followups_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_section_views: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          scroll_depth: number
          section_id: string
          time_spent_sec: number
          view_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          scroll_depth?: number
          section_id: string
          time_spent_sec?: number
          view_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          scroll_depth?: number
          section_id?: string
          time_spent_sec?: number
          view_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_section_views_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_section_views_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "proposal_views"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string
          sections: Json
          theme: Json
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          sections?: Json
          theme?: Json
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          sections?: Json
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_views: {
        Row: {
          created_at: string
          device_type: string | null
          ended_at: string | null
          id: string
          proposal_id: string
          referrer: string | null
          session_id: string
          started_at: string
          total_duration_sec: number
          user_agent: string | null
          viewer_ip: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          proposal_id: string
          referrer?: string | null
          session_id: string
          started_at?: string
          total_duration_sec?: number
          user_agent?: string | null
          viewer_ip?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          proposal_id?: string
          referrer?: string | null
          session_id?: string
          started_at?: string
          total_duration_sec?: number
          user_agent?: string | null
          viewer_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_views_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_id: string | null
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          org_id: string
          password_hash: string | null
          public_slug: string
          sections: Json
          sent_at: string | null
          status: string
          template_id: string | null
          theme: Json
          title: string
          total_value: number | null
          updated_at: string
          view_count: number
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          org_id: string
          password_hash?: string | null
          public_slug?: string
          sections?: Json
          sent_at?: string | null
          status?: string
          template_id?: string | null
          theme?: Json
          title: string
          total_value?: number | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          org_id?: string
          password_hash?: string | null
          public_slug?: string
          sections?: Json
          sent_at?: string | null
          status?: string
          template_id?: string | null
          theme?: Json
          title?: string
          total_value?: number | null
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_leads: {
        Row: {
          apollo_person_id: string | null
          company_industry: string | null
          company_location: string | null
          company_name: string
          company_size: string | null
          company_website: string | null
          contact_email: string | null
          contact_linkedin: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_title: string | null
          converted_at: string | null
          converted_contact_id: string | null
          converted_deal_id: string | null
          created_at: string
          enrichment_status: string
          id: string
          org_id: string
          raw: Json | null
          search_id: string
          source_url: string | null
          updated_at: string
          whatsapp_checked_at: string | null
          whatsapp_status: string
        }
        Insert: {
          apollo_person_id?: string | null
          company_industry?: string | null
          company_location?: string | null
          company_name: string
          company_size?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_linkedin?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          enrichment_status?: string
          id?: string
          org_id: string
          raw?: Json | null
          search_id: string
          source_url?: string | null
          updated_at?: string
          whatsapp_checked_at?: string | null
          whatsapp_status?: string
        }
        Update: {
          apollo_person_id?: string | null
          company_industry?: string | null
          company_location?: string | null
          company_name?: string
          company_size?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_linkedin?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          enrichment_status?: string
          id?: string
          org_id?: string
          raw?: Json | null
          search_id?: string
          source_url?: string | null
          updated_at?: string
          whatsapp_checked_at?: string | null
          whatsapp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_leads_converted_deal_id_fkey"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "prospecting_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_searches: {
        Row: {
          company_size: string | null
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          industry: string | null
          keywords: string[] | null
          last_run_at: string | null
          location: string | null
          name: string
          org_id: string
          status: string
          technologies: string[] | null
          total_found: number
          updated_at: string
        }
        Insert: {
          company_size?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          industry?: string | null
          keywords?: string[] | null
          last_run_at?: string | null
          location?: string | null
          name: string
          org_id: string
          status?: string
          technologies?: string[] | null
          total_found?: number
          updated_at?: string
        }
        Update: {
          company_size?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          industry?: string | null
          keywords?: string[] | null
          last_run_at?: string | null
          location?: string | null
          name?: string
          org_id?: string
          status?: string
          technologies?: string[] | null
          total_found?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_searches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_rules: {
        Row: {
          applies_to: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metric: string
          name: string
          org_id: string
          risk_level: string
          threshold_days: number
        }
        Insert: {
          applies_to?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          name: string
          org_id: string
          risk_level?: string
          threshold_days?: number
        }
        Update: {
          applies_to?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          name?: string
          org_id?: string
          risk_level?: string
          threshold_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          created_at: string | null
          id: string
          org_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          allowed?: boolean
          created_at?: string | null
          id?: string
          org_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          allowed?: boolean
          created_at?: string | null
          id?: string
          org_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_rewards: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          org_id: string
          points_cost: number
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          org_id: string
          points_cost?: number
          stock?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          org_id?: string
          points_cost?: number
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_rewards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_scenarios: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          difficulty: string
          evaluation_criteria: Json | null
          guided_mode: boolean | null
          id: string
          is_active: boolean | null
          org_id: string
          persona_objections: Json | null
          persona_personality: string | null
          persona_role: string | null
          persona_sector: string | null
          system_prompt: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          difficulty?: string
          evaluation_criteria?: Json | null
          guided_mode?: boolean | null
          id?: string
          is_active?: boolean | null
          org_id: string
          persona_objections?: Json | null
          persona_personality?: string | null
          persona_role?: string | null
          persona_sector?: string | null
          system_prompt?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          difficulty?: string
          evaluation_criteria?: Json | null
          guided_mode?: boolean | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          persona_objections?: Json | null
          persona_personality?: string | null
          persona_role?: string | null
          persona_sector?: string | null
          system_prompt?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_scenarios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_sessions: {
        Row: {
          created_at: string
          criteria_scores: Json | null
          duration_seconds: number | null
          ended_at: string | null
          feedback: string | null
          hints_used: number | null
          id: string
          messages: Json
          org_id: string
          scenario_id: string
          score: number | null
          started_at: string
          status: string
          track_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria_scores?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          hints_used?: number | null
          id?: string
          messages?: Json
          org_id: string
          scenario_id: string
          score?: number | null
          started_at?: string
          status?: string
          track_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria_scores?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          hints_used?: number | null
          id?: string
          messages?: Json
          org_id?: string
          scenario_id?: string
          score?: number | null
          started_at?: string
          status?: string
          track_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "roleplay_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_sessions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "roleplay_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_tracks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          org_id: string
          scenario_ids: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          scenario_ids?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          scenario_ids?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_tracks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_user_stats: {
        Row: {
          avg_score: number | null
          current_streak: number | null
          last_session_date: string | null
          longest_streak: number | null
          org_id: string
          total_points: number | null
          total_sessions: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_score?: number | null
          current_streak?: number | null
          last_session_date?: string | null
          longest_streak?: number | null
          org_id: string
          total_points?: number | null
          total_sessions?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_score?: number | null
          current_streak?: number | null
          last_session_date?: string | null
          longest_streak?: number | null
          org_id?: string
          total_points?: number | null
          total_sessions?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_user_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          assign_type: string
          created_at: string | null
          created_by: string | null
          current_value: number
          goal_type: string
          id: string
          org_id: string
          period_month: number
          period_year: number
          target_value: number
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assign_type?: string
          created_at?: string | null
          created_by?: string | null
          current_value?: number
          goal_type?: string
          id?: string
          org_id: string
          period_month: number
          period_year: number
          target_value?: number
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assign_type?: string
          created_at?: string | null
          created_by?: string | null
          current_value?: number
          goal_type?: string
          id?: string
          org_id?: string
          period_month?: number
          period_year?: number
          target_value?: number
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
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
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          color: string
          created_at: string
          default_priority: string
          id: string
          name: string
          org_id: string
          sla_first_response_minutes: number
          sla_resolution_minutes: number
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          default_priority?: string
          id?: string
          name: string
          org_id: string
          sla_first_response_minutes?: number
          sla_resolution_minutes?: number
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_priority?: string
          id?: string
          name?: string
          org_id?: string
          sla_first_response_minutes?: number
          sla_resolution_minutes?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_kb_suggestions: {
        Row: {
          article_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          suggested_reply: string
          ticket_id: string
          used: boolean
        }
        Insert: {
          article_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          suggested_reply: string
          ticket_id: string
          used?: boolean
        }
        Update: {
          article_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          suggested_reply?: string
          ticket_id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ticket_kb_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_kb_suggestions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json
          author_id: string | null
          author_name: string | null
          author_type: string
          body: string
          created_at: string
          external_message_id: string | null
          id: string
          org_id: string
          ticket_id: string
          via: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          author_name?: string | null
          author_type: string
          body: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          org_id: string
          ticket_id: string
          via?: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          body?: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          org_id?: string
          ticket_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_agent_id: string | null
          category_id: string | null
          channel: string
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          first_response_at: string | null
          id: string
          metadata: Json
          number: number
          org_id: string
          priority: string
          priority_reason: string | null
          priority_source: string
          resolved_at: string | null
          sla_first_response_breached: boolean
          sla_first_response_due_at: string | null
          sla_resolution_breached: boolean
          sla_resolution_due_at: string | null
          source_email_id: string | null
          source_whatsapp_conversation_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          category_id?: string | null
          channel?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          metadata?: Json
          number: number
          org_id: string
          priority?: string
          priority_reason?: string | null
          priority_source?: string
          resolved_at?: string | null
          sla_first_response_breached?: boolean
          sla_first_response_due_at?: string | null
          sla_resolution_breached?: boolean
          sla_resolution_due_at?: string | null
          source_email_id?: string | null
          source_whatsapp_conversation_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          category_id?: string | null
          channel?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          metadata?: Json
          number?: number
          org_id?: string
          priority?: string
          priority_reason?: string | null
          priority_source?: string
          resolved_at?: string | null
          sla_first_response_breached?: boolean
          sla_first_response_due_at?: string | null
          sla_resolution_breached?: boolean
          sla_resolution_due_at?: string | null
          source_email_id?: string | null
          source_whatsapp_conversation_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_source_whatsapp_conversation_id_fkey"
            columns: ["source_whatsapp_conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          contact_id: string | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          org_id: string
          page_title: string | null
          page_url: string | null
          referrer: string | null
          visitor_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id: string
          page_title?: string | null
          page_url?: string | null
          referrer?: string | null
          visitor_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          page_title?: string | null
          page_url?: string | null
          referrer?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      typeflow_flows: {
        Row: {
          ab_test_enabled: boolean
          booking_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          notify_discord: boolean
          org_id: string
          slug: string
          thank_you_a: string | null
          thank_you_b: string | null
          thank_you_c: string | null
          thank_you_d: string | null
          updated_at: string
        }
        Insert: {
          ab_test_enabled?: boolean
          booking_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          notify_discord?: boolean
          org_id: string
          slug: string
          thank_you_a?: string | null
          thank_you_b?: string | null
          thank_you_c?: string | null
          thank_you_d?: string | null
          updated_at?: string
        }
        Update: {
          ab_test_enabled?: boolean
          booking_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notify_discord?: boolean
          org_id?: string
          slug?: string
          thank_you_a?: string | null
          thank_you_b?: string | null
          thank_you_c?: string | null
          thank_you_d?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "typeflow_flows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      typeflow_submissions: {
        Row: {
          answers: Json
          company: string | null
          converted_contact_id: string | null
          converted_deal_id: string | null
          created_at: string
          email: string | null
          flow_id: string
          id: string
          ip_hash: string | null
          name: string | null
          org_id: string
          pain: string | null
          phone: string | null
          referrer: string | null
          revenue: string | null
          role: string | null
          score: string
          score_reasons: Json
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variant_key: string | null
        }
        Insert: {
          answers?: Json
          company?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          email?: string | null
          flow_id: string
          id?: string
          ip_hash?: string | null
          name?: string | null
          org_id: string
          pain?: string | null
          phone?: string | null
          referrer?: string | null
          revenue?: string | null
          role?: string | null
          score: string
          score_reasons?: Json
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_key?: string | null
        }
        Update: {
          answers?: Json
          company?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          email?: string | null
          flow_id?: string
          id?: string
          ip_hash?: string | null
          name?: string | null
          org_id?: string
          pain?: string | null
          phone?: string | null
          referrer?: string | null
          revenue?: string | null
          role?: string | null
          score?: string
          score_reasons?: Json
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "typeflow_submissions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "typeflow_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typeflow_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      typeflow_variants: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          key: string
          name: string
          questions: Json
          weight: number
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          key: string
          name: string
          questions?: Json
          weight?: number
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          key?: string
          name?: string
          questions?: Json
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "typeflow_variants_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "typeflow_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          created_at: string
          elevenlabs_agent_id: string | null
          fallback_number: string | null
          greeting: string | null
          id: string
          is_active: boolean
          language: string
          name: string
          org_id: string
          system_prompt: string
          transfer_rules: Json
          updated_at: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          elevenlabs_agent_id?: string | null
          fallback_number?: string | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name: string
          org_id: string
          system_prompt: string
          transfer_rules?: Json
          updated_at?: string
          voice_id: string
        }
        Update: {
          created_at?: string
          elevenlabs_agent_id?: string | null
          fallback_number?: string | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          org_id?: string
          system_prompt?: string
          transfer_rules?: Json
          updated_at?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          ai_handled: boolean
          channel_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          deal_id: string | null
          direction: Database["public"]["Enums"]["omni_msg_direction"]
          duration_sec: number | null
          ended_at: string | null
          from_number: string | null
          human_agent_id: string | null
          id: string
          metadata: Json
          org_id: string
          recording_url: string | null
          started_at: string
          status: Database["public"]["Enums"]["voice_call_status"]
          summary: string | null
          to_number: string | null
          transcript_full: string | null
          twilio_call_sid: string | null
          updated_at: string
          voice_agent_id: string | null
        }
        Insert: {
          ai_handled?: boolean
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction: Database["public"]["Enums"]["omni_msg_direction"]
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          human_agent_id?: string | null
          id?: string
          metadata?: Json
          org_id: string
          recording_url?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["voice_call_status"]
          summary?: string | null
          to_number?: string | null
          transcript_full?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Update: {
          ai_handled?: boolean
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction?: Database["public"]["Enums"]["omni_msg_direction"]
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          human_agent_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          recording_url?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["voice_call_status"]
          summary?: string | null
          to_number?: string | null
          transcript_full?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_calls_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "omni_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string | null
          events: string[]
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          org_id: string
          secret: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          org_id: string
          secret?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          org_id?: string
          secret?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_config: {
        Row: {
          auto_create_lead: boolean
          fallback_msg: string
          id: string
          is_active: boolean
          lead_pipeline_id: string | null
          lead_stage_id: string | null
          max_ai_turns: number
          model: string
          off_hours_msg: string
          org_id: string
          quick_actions: Json
          response_delay_ms: number
          system_prompt: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          auto_create_lead?: boolean
          fallback_msg?: string
          id?: string
          is_active?: boolean
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          max_ai_turns?: number
          model?: string
          off_hours_msg?: string
          org_id: string
          quick_actions?: Json
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          auto_create_lead?: boolean
          fallback_msg?: string
          id?: string
          is_active?: boolean
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          max_ai_turns?: number
          model?: string
          off_hours_msg?: string
          org_id?: string
          quick_actions?: Json
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_config_lead_pipeline_id_fkey"
            columns: ["lead_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_config_lead_stage_id_fkey"
            columns: ["lead_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          ai_context: Json
          assigned_agent_id: string | null
          assigned_at: string | null
          assigned_to: string | null
          assignment_status: Database["public"]["Enums"]["conversation_assignment_status"]
          contact_id: string | null
          contact_jid: string | null
          contact_name: string | null
          created_at: string
          deal_id: string | null
          first_response_at: string | null
          id: string
          instance_id: string | null
          instance_name: string | null
          is_group: boolean
          last_agent_message_at: string | null
          last_message: string | null
          last_message_at: string | null
          last_summary_at: string | null
          last_urgency: string | null
          mode: string
          org_id: string
          phone_number: string
          priority: Database["public"]["Enums"]["conversation_priority"]
          profile_pic_url: string | null
          resolved_at: string | null
          status: string
          summary_stale: boolean
          tags: Json
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_context?: Json
          assigned_agent_id?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_status?: Database["public"]["Enums"]["conversation_assignment_status"]
          contact_id?: string | null
          contact_jid?: string | null
          contact_name?: string | null
          created_at?: string
          deal_id?: string | null
          first_response_at?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_group?: boolean
          last_agent_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_summary_at?: string | null
          last_urgency?: string | null
          mode?: string
          org_id: string
          phone_number: string
          priority?: Database["public"]["Enums"]["conversation_priority"]
          profile_pic_url?: string | null
          resolved_at?: string | null
          status?: string
          summary_stale?: boolean
          tags?: Json
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_context?: Json
          assigned_agent_id?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_status?: Database["public"]["Enums"]["conversation_assignment_status"]
          contact_id?: string | null
          contact_jid?: string | null
          contact_name?: string | null
          created_at?: string
          deal_id?: string | null
          first_response_at?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_group?: boolean
          last_agent_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_summary_at?: string | null
          last_urgency?: string | null
          mode?: string
          org_id?: string
          phone_number?: string
          priority?: Database["public"]["Enums"]["conversation_priority"]
          profile_pic_url?: string | null
          resolved_at?: string | null
          status?: string
          summary_stale?: boolean
          tags?: Json
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          org_id: string
          reason: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          org_id: string
          reason?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_alerts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_settings: {
        Row: {
          alert_on_complaint: boolean
          alert_on_critical: boolean
          conversation_id: string
          created_at: string
          display_name: string | null
          id: string
          linked_contact_id: string | null
          linked_deal_id: string | null
          monitoring_enabled: boolean
          notify_user_ids: string[]
          org_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          alert_on_complaint?: boolean
          alert_on_critical?: boolean
          conversation_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          linked_contact_id?: string | null
          linked_deal_id?: string | null
          monitoring_enabled?: boolean
          notify_user_ids?: string[]
          org_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          alert_on_complaint?: boolean
          alert_on_critical?: boolean
          conversation_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          linked_contact_id?: string | null
          linked_deal_id?: string | null
          monitoring_enabled?: boolean
          notify_user_ids?: string[]
          org_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_settings_linked_contact_id_fkey"
            columns: ["linked_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_settings_linked_deal_id_fkey"
            columns: ["linked_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_suggestions: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          kb_article_ids: string[]
          message_id: string | null
          org_id: string
          suggested_reply: string
          used: boolean
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kb_article_ids?: string[]
          message_id?: string | null
          org_id: string
          suggested_reply: string
          used?: boolean
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kb_article_ids?: string[]
          message_id?: string | null
          org_id?: string
          suggested_reply?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_suggestions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_secrets: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          instance_id: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          id?: string
          instance_id: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          instance_id_external: string | null
          instance_name: string
          is_active: boolean
          is_default: boolean | null
          monitor_groups: boolean
          org_id: string
          phone_number: string | null
          provider_type: string
          qr_code: string | null
          qrcode_base64: string | null
          server_url: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          instance_id_external?: string | null
          instance_name: string
          is_active?: boolean
          is_default?: boolean | null
          monitor_groups?: boolean
          org_id: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          qrcode_base64?: string | null
          server_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          instance_id_external?: string | null
          instance_name?: string
          is_active?: boolean
          is_default?: boolean | null
          monitor_groups?: boolean
          org_id?: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          qrcode_base64?: string | null
          server_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_classifications: {
        Row: {
          category: string
          confidence: number
          conversation_id: string
          created_at: string
          id: string
          is_critical: boolean
          message_id: string
          org_id: string
          reasoning: string | null
          sentiment: string
          topics: string[]
        }
        Insert: {
          category: string
          confidence?: number
          conversation_id: string
          created_at?: string
          id?: string
          is_critical?: boolean
          message_id: string
          org_id: string
          reasoning?: string | null
          sentiment?: string
          topics?: string[]
        }
        Update: {
          category?: string
          confidence?: number
          conversation_id?: string
          created_at?: string
          id?: string
          is_critical?: boolean
          message_id?: string
          org_id?: string
          reasoning?: string | null
          sentiment?: string
          topics?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_classifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_classifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_classifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          ai_model: string | null
          caption: string | null
          content: string | null
          conversation_id: string
          direction: string
          evolution_id: string | null
          id: string
          is_ai: boolean
          media_mime: string | null
          media_url: string | null
          metadata: Json
          org_id: string
          quoted_msg_id: string | null
          sent_at: string
          status: string
          type: string
          urgency: string | null
          urgency_classified_at: string | null
          urgency_reason: string | null
        }
        Insert: {
          ai_model?: string | null
          caption?: string | null
          content?: string | null
          conversation_id: string
          direction: string
          evolution_id?: string | null
          id?: string
          is_ai?: boolean
          media_mime?: string | null
          media_url?: string | null
          metadata?: Json
          org_id: string
          quoted_msg_id?: string | null
          sent_at?: string
          status?: string
          type?: string
          urgency?: string | null
          urgency_classified_at?: string | null
          urgency_reason?: string | null
        }
        Update: {
          ai_model?: string | null
          caption?: string | null
          content?: string | null
          conversation_id?: string
          direction?: string
          evolution_id?: string | null
          id?: string
          is_ai?: boolean
          media_mime?: string | null
          media_url?: string | null
          metadata?: Json
          org_id?: string
          quoted_msg_id?: string | null
          sent_at?: string
          status?: string
          type?: string
          urgency?: string | null
          urgency_classified_at?: string | null
          urgency_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_quick_actions: {
        Row: {
          color: string
          config: Json
          icon: string
          id: string
          label: string
          order_index: number
          org_id: string
          type: string
        }
        Insert: {
          color?: string
          config?: Json
          icon?: string
          id?: string
          label: string
          order_index?: number
          org_id: string
          type: string
        }
        Update: {
          color?: string
          config?: Json
          icon?: string
          id?: string
          label?: string
          order_index?: number
          org_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_quick_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization_for_user: {
        Args: {
          p_name: string
          p_settings?: Json
          p_slug: string
          p_user_id: string
        }
        Returns: string
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_org_owner: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: undefined
      }
      next_ticket_number: { Args: { p_org_id: string }; Returns: number }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_type: "call" | "email" | "meeting" | "note" | "task"
      agent_status_kind: "available" | "busy" | "away" | "offline"
      app_role: "owner" | "admin" | "member"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "canceled"
        | "failed"
      contact_status: "lead" | "prospect" | "customer" | "churned"
      conversation_assignment_status:
        | "unassigned"
        | "assigned"
        | "transferring"
        | "resolved"
      conversation_priority: "low" | "normal" | "high"
      deal_status: "open" | "won" | "lost"
      ig_match_mode: "any" | "all" | "exact" | "contains"
      ig_trigger_type: "comment" | "dm" | "mention" | "story_reply"
      omni_channel_type: "whatsapp" | "instagram" | "messenger" | "voice"
      omni_conv_status: "open" | "pending" | "resolved" | "snoozed"
      omni_msg_direction: "in" | "out"
      omni_msg_type:
        | "text"
        | "audio"
        | "image"
        | "video"
        | "file"
        | "call"
        | "voicemail"
        | "system"
      omni_provider: "evolution" | "meta" | "twilio" | "elevenlabs"
      recipient_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "replied"
      voice_call_status:
        | "ringing"
        | "in_progress"
        | "completed"
        | "failed"
        | "busy"
        | "no_answer"
        | "canceled"
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
      activity_type: ["call", "email", "meeting", "note", "task"],
      agent_status_kind: ["available", "busy", "away", "offline"],
      app_role: ["owner", "admin", "member"],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "canceled",
        "failed",
      ],
      contact_status: ["lead", "prospect", "customer", "churned"],
      conversation_assignment_status: [
        "unassigned",
        "assigned",
        "transferring",
        "resolved",
      ],
      conversation_priority: ["low", "normal", "high"],
      deal_status: ["open", "won", "lost"],
      ig_match_mode: ["any", "all", "exact", "contains"],
      ig_trigger_type: ["comment", "dm", "mention", "story_reply"],
      omni_channel_type: ["whatsapp", "instagram", "messenger", "voice"],
      omni_conv_status: ["open", "pending", "resolved", "snoozed"],
      omni_msg_direction: ["in", "out"],
      omni_msg_type: [
        "text",
        "audio",
        "image",
        "video",
        "file",
        "call",
        "voicemail",
        "system",
      ],
      omni_provider: ["evolution", "meta", "twilio", "elevenlabs"],
      recipient_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "replied",
      ],
      voice_call_status: [
        "ringing",
        "in_progress",
        "completed",
        "failed",
        "busy",
        "no_answer",
        "canceled",
      ],
    },
  },
} as const
