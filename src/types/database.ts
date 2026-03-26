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
    PostgrestVersion: "14.1"
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
      artists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          profile_image_id: string | null
          project_id: string
          shop_theme: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          profile_image_id?: string | null
          project_id: string
          shop_theme?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          profile_image_id?: string | null
          project_id?: string
          shop_theme?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artists_profile_image_id_fkey"
            columns: ["profile_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verifications: {
        Row: {
          attempts: number | null
          code: string | null
          created_at: string
          email: string
          expires_at: string
          hashed_password: string | null
          id: string
          purpose: Database["public"]["Enums"]["verification_purpose"]
          token: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number | null
          code?: string | null
          created_at?: string
          email: string
          expires_at: string
          hashed_password?: string | null
          id?: string
          purpose: Database["public"]["Enums"]["verification_purpose"]
          token: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number | null
          code?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          hashed_password?: string | null
          id?: string
          purpose?: Database["public"]["Enums"]["verification_purpose"]
          token?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      images: {
        Row: {
          alt_text: string | null
          cdn_url: string | null
          created_at: string
          file_name: string
          file_size: number
          height: number | null
          id: string
          image_type: string
          is_active: boolean
          mime_type: string
          public_url: string
          r2_bucket: string
          r2_key: string
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          cdn_url?: string | null
          created_at?: string
          file_name: string
          file_size: number
          height?: number | null
          id?: string
          image_type: string
          is_active?: boolean
          mime_type: string
          public_url: string
          r2_bucket: string
          r2_key: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          cdn_url?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          height?: number | null
          id?: string
          image_type?: string
          is_active?: boolean
          mime_type?: string
          public_url?: string
          r2_bucket?: string
          r2_key?: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      logs: {
        Row: {
          admin_id: string | null
          changes: Json | null
          created_at: string | null
          event_category: string
          event_type: string
          id: string
          ip_address: unknown
          message: string
          metadata: Json | null
          request_path: string | null
          resource_id: string | null
          resource_type: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          changes?: Json | null
          created_at?: string | null
          event_category: string
          event_type: string
          id?: string
          ip_address?: unknown
          message: string
          metadata?: Json | null
          request_path?: string | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          changes?: Json | null
          created_at?: string | null
          event_category?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          message?: string
          metadata?: Json | null
          request_path?: string | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_asset_upload_sessions: {
        Row: {
          aborted_at: string | null
          asset_kind: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          asset_status: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          file_name: string
          file_size: number
          id: string
          media_asset_id: string | null
          metadata: Json
          mime_type: string
          part_size: number
          status: Database["public"]["Enums"]["v2_media_asset_upload_session_status_enum"]
          storage_path: string
          total_parts: number
          updated_at: string
          upload_id: string
          uploaded_parts_json: Json
        }
        Insert: {
          aborted_at?: string | null
          asset_kind?: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          asset_status?: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          file_name: string
          file_size: number
          id?: string
          media_asset_id?: string | null
          metadata?: Json
          mime_type: string
          part_size: number
          status?: Database["public"]["Enums"]["v2_media_asset_upload_session_status_enum"]
          storage_path: string
          total_parts: number
          updated_at?: string
          upload_id: string
          uploaded_parts_json?: Json
        }
        Update: {
          aborted_at?: string | null
          asset_kind?: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          asset_status?: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          file_name?: string
          file_size?: number
          id?: string
          media_asset_id?: string | null
          metadata?: Json
          mime_type?: string
          part_size?: number
          status?: Database["public"]["Enums"]["v2_media_asset_upload_session_status_enum"]
          storage_path?: string
          total_parts?: number
          updated_at?: string
          upload_id?: string
          uploaded_parts_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "media_asset_upload_sessions_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          asset_kind: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          checksum: string | null
          created_at: string
          deleted_at: string | null
          file_name: string
          file_size: number | null
          id: string
          metadata: Json
          mime_type: string | null
          public_url: string | null
          status: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          storage_bucket: string | null
          storage_path: string
          storage_provider: string
          updated_at: string
        }
        Insert: {
          asset_kind?: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          public_url?: string | null
          status?: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          storage_bucket?: string | null
          storage_path: string
          storage_provider?: string
          updated_at?: string
        }
        Update: {
          asset_kind?: Database["public"]["Enums"]["v2_media_asset_kind_enum"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          public_url?: string | null
          status?: Database["public"]["Enums"]["v2_media_asset_status_enum"]
          storage_bucket?: string | null
          storage_path?: string
          storage_provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          allocated_discount_amount: number
          allocated_unit_amount: number | null
          bundle_component_id_snapshot: string | null
          bundle_definition_id_snapshot: string | null
          created_at: string
          download_count: number
          download_url: string | null
          id: string
          item_status: Database["public"]["Enums"]["order_status"]
          last_downloaded_at: string | null
          line_type: Database["public"]["Enums"]["order_item_line_type"]
          order_id: string
          parent_order_item_id: string | null
          price_snapshot: number
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
        }
        Insert: {
          allocated_discount_amount?: number
          allocated_unit_amount?: number | null
          bundle_component_id_snapshot?: string | null
          bundle_definition_id_snapshot?: string | null
          created_at?: string
          download_count?: number
          download_url?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_status"]
          last_downloaded_at?: string | null
          line_type?: Database["public"]["Enums"]["order_item_line_type"]
          order_id: string
          parent_order_item_id?: string | null
          price_snapshot: number
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity?: number
        }
        Update: {
          allocated_discount_amount?: number
          allocated_unit_amount?: number | null
          bundle_component_id_snapshot?: string | null
          bundle_definition_id_snapshot?: string | null
          created_at?: string
          download_count?: number
          download_url?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_status"]
          last_downloaded_at?: string | null
          line_type?: Database["public"]["Enums"]["order_item_line_type"]
          order_id?: string
          parent_order_item_id?: string | null
          price_snapshot?: number
          product_id?: string
          product_name?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_bundle_component_id_snapshot_fkey"
            columns: ["bundle_component_id_snapshot"]
            isOneToOne: false
            referencedRelation: "v2_bundle_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_bundle_definition_id_snapshot_fkey"
            columns: ["bundle_definition_id_snapshot"]
            isOneToOne: false
            referencedRelation: "v2_bundle_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_parent_order_item_id_fkey"
            columns: ["parent_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_memo: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          id: string
          order_number: string
          shipping_detail_address: string | null
          shipping_main_address: string | null
          shipping_memo: string | null
          shipping_name: string | null
          shipping_phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_memo?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          order_number: string
          shipping_detail_address?: string | null
          shipping_main_address?: string | null
          shipping_memo?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_memo?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          order_number?: string
          shipping_detail_address?: string | null
          shipping_main_address?: string | null
          shipping_memo?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_bundles: {
        Row: {
          bundle_product_id: string
          component_product_id: string
          created_at: string
          id: string
          quantity: number
        }
        Insert: {
          bundle_product_id: string
          component_product_id: string
          created_at?: string
          id?: string
          quantity?: number
        }
        Update: {
          bundle_product_id?: string
          component_product_id?: string
          created_at?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_bundles_bundle_product_id_fkey"
            columns: ["bundle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          digital_file_url: string | null
          id: string
          is_active: boolean
          main_image_id: string | null
          name: string
          price: number
          project_id: string
          sample_audio_url: string | null
          slug: string
          stock: number | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          is_active?: boolean
          main_image_id?: string | null
          name: string
          price: number
          project_id: string
          sample_audio_url?: string | null
          slug: string
          stock?: number | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          is_active?: boolean
          main_image_id?: string | null
          name?: string
          price?: number
          project_id?: string
          sample_audio_url?: string | null
          slug?: string
          stock?: number | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_main_image_id_fkey"
            columns: ["main_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          detail_address: string | null
          email: string
          id: string
          is_phone_verified: boolean
          main_address: string | null
          name: string | null
          phone: string | null
          phone_verification_code: string | null
          phone_verification_expires_at: string | null
          phone_verification_request_count: number
          phone_verification_request_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail_address?: string | null
          email: string
          id: string
          is_phone_verified?: boolean
          main_address?: string | null
          name?: string | null
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verification_request_count?: number
          phone_verification_request_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail_address?: string | null
          email?: string
          id?: string
          is_phone_verified?: boolean
          main_address?: string | null
          name?: string | null
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verification_request_count?: number
          phone_verification_request_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          cover_image_id: string | null
          created_at: string
          description: string | null
          external_links: Json | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          release_date: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          cover_image_id?: string | null
          created_at?: string
          description?: string | null
          external_links?: Json | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          release_date?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          cover_image_id?: string | null
          created_at?: string
          description?: string | null
          external_links?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          release_date?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_cover_image_id_fkey"
            columns: ["cover_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          admin_memo: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          delivery_memo: string | null
          id: string
          order_item_id: string
          recipient_address: string
          recipient_name: string
          recipient_phone: string
          shipped_at: string | null
          shipping_status: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          admin_memo?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_memo?: string | null
          id?: string
          order_item_id: string
          recipient_address: string
          recipient_name: string
          recipient_phone: string
          shipped_at?: string | null
          shipping_status?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          admin_memo?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_memo?: string | null
          id?: string
          order_item_id?: string
          recipient_address?: string
          recipient_name?: string
          recipient_phone?: string
          shipped_at?: string | null
          shipping_status?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_action_logs: {
        Row: {
          action_key: string
          action_status: Database["public"]["Enums"]["v2_admin_action_status_enum"]
          actor_email_snapshot: string | null
          actor_id: string | null
          created_at: string
          domain: string
          error_code: string | null
          error_message: string | null
          execution_result: Json
          finished_at: string | null
          id: string
          input_payload: Json
          metadata: Json
          permission_result: Json
          precheck_result: Json
          request_id: string | null
          requires_approval: boolean
          resource_id: string | null
          resource_type: string | null
          started_at: string
          transition_result: Json
          updated_at: string
        }
        Insert: {
          action_key: string
          action_status?: Database["public"]["Enums"]["v2_admin_action_status_enum"]
          actor_email_snapshot?: string | null
          actor_id?: string | null
          created_at?: string
          domain: string
          error_code?: string | null
          error_message?: string | null
          execution_result?: Json
          finished_at?: string | null
          id?: string
          input_payload?: Json
          metadata?: Json
          permission_result?: Json
          precheck_result?: Json
          request_id?: string | null
          requires_approval?: boolean
          resource_id?: string | null
          resource_type?: string | null
          started_at?: string
          transition_result?: Json
          updated_at?: string
        }
        Update: {
          action_key?: string
          action_status?: Database["public"]["Enums"]["v2_admin_action_status_enum"]
          actor_email_snapshot?: string | null
          actor_id?: string | null
          created_at?: string
          domain?: string
          error_code?: string | null
          error_message?: string | null
          execution_result?: Json
          finished_at?: string | null
          id?: string
          input_payload?: Json
          metadata?: Json
          permission_result?: Json
          precheck_result?: Json
          request_id?: string | null
          requires_approval?: boolean
          resource_id?: string | null
          resource_type?: string | null
          started_at?: string
          transition_result?: Json
          updated_at?: string
        }
        Relationships: []
      }
      v2_admin_approval_requests: {
        Row: {
          action_key: string
          action_log_id: string
          approver_id: string | null
          assignee_role_code: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          domain: string
          id: string
          metadata: Json
          requested_at: string
          requester_id: string | null
          status: Database["public"]["Enums"]["v2_admin_approval_status_enum"]
          updated_at: string
        }
        Insert: {
          action_key: string
          action_log_id: string
          approver_id?: string | null
          assignee_role_code?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          domain: string
          id?: string
          metadata?: Json
          requested_at?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["v2_admin_approval_status_enum"]
          updated_at?: string
        }
        Update: {
          action_key?: string
          action_log_id?: string
          approver_id?: string | null
          assignee_role_code?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          domain?: string
          id?: string
          metadata?: Json
          requested_at?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["v2_admin_approval_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_admin_approval_requests_action_log_id_fkey"
            columns: ["action_log_id"]
            isOneToOne: true
            referencedRelation: "v2_admin_action_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          domain: string
          id: string
          metadata: Json
          note_type: string
          resource_id: string
          resource_type: string
          updated_at: string
          visibility: Database["public"]["Enums"]["v2_admin_note_visibility_enum"]
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          domain: string
          id?: string
          metadata?: Json
          note_type?: string
          resource_id: string
          resource_type: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["v2_admin_note_visibility_enum"]
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          domain?: string
          id?: string
          metadata?: Json
          note_type?: string
          resource_id?: string
          resource_type?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["v2_admin_note_visibility_enum"]
        }
        Relationships: []
      }
      v2_admin_role_permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metadata: Json
          permission_code: string
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          permission_code: string
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          permission_code?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_admin_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      v2_admin_state_transition_logs: {
        Row: {
          action_log_id: string | null
          actor_id: string | null
          created_at: string
          domain: string
          from_state: string | null
          id: string
          payload: Json
          reason: string | null
          resource_id: string
          resource_type: string
          to_state: string | null
          transition_key: string
        }
        Insert: {
          action_log_id?: string | null
          actor_id?: string | null
          created_at?: string
          domain: string
          from_state?: string | null
          id?: string
          payload?: Json
          reason?: string | null
          resource_id: string
          resource_type: string
          to_state?: string | null
          transition_key: string
        }
        Update: {
          action_log_id?: string | null
          actor_id?: string | null
          created_at?: string
          domain?: string
          from_state?: string | null
          id?: string
          payload?: Json
          reason?: string | null
          resource_id?: string
          resource_type?: string
          to_state?: string | null
          transition_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_admin_state_transition_logs_action_log_id_fkey"
            columns: ["action_log_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_action_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assigned_reason: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          role_id: string
          scope_id: string | null
          scope_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_reason?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          role_id: string
          scope_id?: string | null
          scope_type?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_reason?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          role_id?: string
          scope_id?: string | null
          scope_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_admin_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_artists: {
        Row: {
          bio: string | null
          created_at: string
          deleted_at: string | null
          id: string
          legacy_artist_id: string | null
          metadata: Json
          name: string
          profile_image_url: string | null
          slug: string
          status: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          legacy_artist_id?: string | null
          metadata?: Json
          name: string
          profile_image_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          legacy_artist_id?: string | null
          metadata?: Json
          name?: string
          profile_image_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      v2_bundle_component_options: {
        Row: {
          bundle_component_id: string
          created_at: string
          id: string
          metadata: Json
          option_key: string
          option_value: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bundle_component_id: string
          created_at?: string
          id?: string
          metadata?: Json
          option_key: string
          option_value: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bundle_component_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          option_key?: string
          option_value?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_bundle_component_options_bundle_component_id_fkey"
            columns: ["bundle_component_id"]
            isOneToOne: false
            referencedRelation: "v2_bundle_components"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_bundle_components: {
        Row: {
          bundle_definition_id: string
          component_variant_id: string
          created_at: string
          default_quantity: number
          deleted_at: string | null
          id: string
          is_required: boolean
          max_quantity: number
          metadata: Json
          min_quantity: number
          price_allocation_weight: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          bundle_definition_id: string
          component_variant_id: string
          created_at?: string
          default_quantity?: number
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          max_quantity?: number
          metadata?: Json
          min_quantity?: number
          price_allocation_weight?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bundle_definition_id?: string
          component_variant_id?: string
          created_at?: string
          default_quantity?: number
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          max_quantity?: number
          metadata?: Json
          min_quantity?: number
          price_allocation_weight?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_bundle_components_bundle_definition_id_fkey"
            columns: ["bundle_definition_id"]
            isOneToOne: false
            referencedRelation: "v2_bundle_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_bundle_components_component_variant_id_fkey"
            columns: ["component_variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_bundle_definitions: {
        Row: {
          anchor_product_id: string
          bundle_product_id: string
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["v2_bundle_mode_enum"]
          pricing_strategy: Database["public"]["Enums"]["v2_bundle_pricing_strategy_enum"]
          status: Database["public"]["Enums"]["v2_bundle_status_enum"]
          updated_at: string
          version_no: number
        }
        Insert: {
          anchor_product_id: string
          bundle_product_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["v2_bundle_mode_enum"]
          pricing_strategy?: Database["public"]["Enums"]["v2_bundle_pricing_strategy_enum"]
          status?: Database["public"]["Enums"]["v2_bundle_status_enum"]
          updated_at?: string
          version_no?: number
        }
        Update: {
          anchor_product_id?: string
          bundle_product_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["v2_bundle_mode_enum"]
          pricing_strategy?: Database["public"]["Enums"]["v2_bundle_pricing_strategy_enum"]
          status?: Database["public"]["Enums"]["v2_bundle_status_enum"]
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "v2_bundle_definitions_anchor_product_id_fkey"
            columns: ["anchor_product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_bundle_definitions_bundle_product_id_fkey"
            columns: ["bundle_product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_campaign_targets: {
        Row: {
          campaign_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_excluded: boolean
          metadata: Json
          sort_order: number
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["v2_campaign_target_type_enum"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_excluded?: boolean
          metadata?: Json
          sort_order?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["v2_campaign_target_type_enum"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_excluded?: boolean
          metadata?: Json
          sort_order?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["v2_campaign_target_type_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v2_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_campaigns: {
        Row: {
          campaign_type: Database["public"]["Enums"]["v2_campaign_type_enum"]
          channel_scope_json: Json
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          metadata: Json
          name: string
          purchase_limit_json: Json
          shop_banner_alt_text: string | null
          shop_banner_media_asset_id: string | null
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["v2_campaign_status_enum"]
          updated_at: string
        }
        Insert: {
          campaign_type?: Database["public"]["Enums"]["v2_campaign_type_enum"]
          channel_scope_json?: Json
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          name: string
          purchase_limit_json?: Json
          shop_banner_alt_text?: string | null
          shop_banner_media_asset_id?: string | null
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_campaign_status_enum"]
          updated_at?: string
        }
        Update: {
          campaign_type?: Database["public"]["Enums"]["v2_campaign_type_enum"]
          channel_scope_json?: Json
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          name?: string
          purchase_limit_json?: Json
          shop_banner_alt_text?: string | null
          shop_banner_media_asset_id?: string | null
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_campaign_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_campaigns_shop_banner_media_asset_id_fkey"
            columns: ["shop_banner_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cart_items: {
        Row: {
          added_via: string
          bundle_configuration_snapshot: Json | null
          campaign_id: string | null
          cart_id: string
          created_at: string
          deleted_at: string | null
          display_price_snapshot: Json | null
          id: string
          metadata: Json
          product_id: string | null
          product_kind_snapshot: Database["public"]["Enums"]["v2_product_kind_enum"]
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          added_via?: string
          bundle_configuration_snapshot?: Json | null
          campaign_id?: string | null
          cart_id: string
          created_at?: string
          deleted_at?: string | null
          display_price_snapshot?: Json | null
          id?: string
          metadata?: Json
          product_id?: string | null
          product_kind_snapshot?: Database["public"]["Enums"]["v2_product_kind_enum"]
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          added_via?: string
          bundle_configuration_snapshot?: Json | null
          campaign_id?: string | null
          cart_id?: string
          created_at?: string
          deleted_at?: string | null
          display_price_snapshot?: Json | null
          id?: string
          metadata?: Json
          product_id?: string | null
          product_kind_snapshot?: Database["public"]["Enums"]["v2_product_kind_enum"]
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cart_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v2_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "v2_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_carts: {
        Row: {
          converted_order_id: string | null
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          last_activity_at: string
          metadata: Json
          profile_id: string | null
          sales_channel_id: string
          session_key: string | null
          status: Database["public"]["Enums"]["v2_cart_status_enum"]
          updated_at: string
        }
        Insert: {
          converted_order_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          last_activity_at?: string
          metadata?: Json
          profile_id?: string | null
          sales_channel_id?: string
          session_key?: string | null
          status?: Database["public"]["Enums"]["v2_cart_status_enum"]
          updated_at?: string
        }
        Update: {
          converted_order_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          last_activity_at?: string
          metadata?: Json
          profile_id?: string | null
          sales_channel_id?: string
          session_key?: string | null
          status?: Database["public"]["Enums"]["v2_cart_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_carts_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_carts_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_coupon_redemptions: {
        Row: {
          applied_at: string | null
          coupon_id: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          metadata: Json
          order_id: string | null
          quote_reference: string | null
          released_at: string | null
          reserved_at: string
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          status: Database["public"]["Enums"]["v2_coupon_redemption_status_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          coupon_id: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          quote_reference?: string | null
          released_at?: string | null
          reserved_at?: string
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          status?: Database["public"]["Enums"]["v2_coupon_redemption_status_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          coupon_id?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          quote_reference?: string | null
          released_at?: string | null
          reserved_at?: string
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          status?: Database["public"]["Enums"]["v2_coupon_redemption_status_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "v2_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_coupons: {
        Row: {
          channel_scope_json: Json
          code: string
          created_at: string
          deleted_at: string | null
          ends_at: string | null
          id: string
          max_issuance: number | null
          max_redemptions_per_user: number
          metadata: Json
          promotion_id: string | null
          purchase_limit_json: Json
          redeemed_count: number
          reserved_count: number
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["v2_coupon_status_enum"]
          updated_at: string
        }
        Insert: {
          channel_scope_json?: Json
          code: string
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          max_issuance?: number | null
          max_redemptions_per_user?: number
          metadata?: Json
          promotion_id?: string | null
          purchase_limit_json?: Json
          redeemed_count?: number
          reserved_count?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_coupon_status_enum"]
          updated_at?: string
        }
        Update: {
          channel_scope_json?: Json
          code?: string
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          max_issuance?: number | null
          max_redemptions_per_user?: number
          metadata?: Json
          promotion_id?: string | null
          purchase_limit_json?: Json
          redeemed_count?: number
          reserved_count?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_coupon_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_coupons_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "v2_promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_batches: {
        Row: {
          batch_key: string
          created_at: string
          domain_id: string
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          result_summary: Json
          run_type: string
          source_snapshot: Json
          started_at: string | null
          status: Database["public"]["Enums"]["v2_cutover_batch_status_enum"]
          updated_at: string
        }
        Insert: {
          batch_key: string
          created_at?: string
          domain_id: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          result_summary?: Json
          run_type: string
          source_snapshot?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_batch_status_enum"]
          updated_at?: string
        }
        Update: {
          batch_key?: string
          created_at?: string
          domain_id?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          result_summary?: Json
          run_type?: string
          source_snapshot?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_batch_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_batches_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_domains: {
        Row: {
          created_at: string
          current_stage: number
          domain_key: string
          domain_name: string
          id: string
          last_gate_result: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          metadata: Json
          next_action: string | null
          owner_role_code: string | null
          status: Database["public"]["Enums"]["v2_cutover_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stage?: number
          domain_key: string
          domain_name: string
          id?: string
          last_gate_result?: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          metadata?: Json
          next_action?: string | null
          owner_role_code?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stage?: number
          domain_key?: string
          domain_name?: string
          id?: string
          last_gate_result?: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          metadata?: Json
          next_action?: string | null
          owner_role_code?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_status_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      v2_cutover_gate_reports: {
        Row: {
          created_at: string
          detail: string | null
          domain_id: string
          gate_key: string
          gate_result: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          gate_type: Database["public"]["Enums"]["v2_cutover_gate_type_enum"]
          id: string
          measured_at: string
          metadata: Json
          metrics_json: Json
          threshold_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain_id: string
          gate_key: string
          gate_result: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          gate_type: Database["public"]["Enums"]["v2_cutover_gate_type_enum"]
          id?: string
          measured_at?: string
          metadata?: Json
          metrics_json?: Json
          threshold_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain_id?: string
          gate_key?: string
          gate_result?: Database["public"]["Enums"]["v2_cutover_gate_result_enum"]
          gate_type?: Database["public"]["Enums"]["v2_cutover_gate_type_enum"]
          id?: string
          measured_at?: string
          metadata?: Json
          metrics_json?: Json
          threshold_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_gate_reports_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_legacy_mappings: {
        Row: {
          confidence_score: number
          created_at: string
          domain_id: string
          id: string
          legacy_resource_id: string
          legacy_resource_type: string
          mapping_status: string
          metadata: Json
          updated_at: string
          v2_resource_id: string | null
          v2_resource_type: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          domain_id: string
          id?: string
          legacy_resource_id: string
          legacy_resource_type: string
          mapping_status?: string
          metadata?: Json
          updated_at?: string
          v2_resource_id?: string | null
          v2_resource_type: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          domain_id?: string
          id?: string
          legacy_resource_id?: string
          legacy_resource_type?: string
          mapping_status?: string
          metadata?: Json
          updated_at?: string
          v2_resource_id?: string | null
          v2_resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_legacy_mappings_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_routing_flags: {
        Row: {
          campaign_id: string | null
          channel: string | null
          created_at: string
          domain_id: string
          enabled: boolean
          id: string
          metadata: Json
          priority: number
          reason: string | null
          target: Database["public"]["Enums"]["v2_cutover_route_target_enum"]
          traffic_percent: number
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          channel?: string | null
          created_at?: string
          domain_id: string
          enabled?: boolean
          id?: string
          metadata?: Json
          priority?: number
          reason?: string | null
          target?: Database["public"]["Enums"]["v2_cutover_route_target_enum"]
          traffic_percent?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          channel?: string | null
          created_at?: string
          domain_id?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          priority?: number
          reason?: string | null
          target?: Database["public"]["Enums"]["v2_cutover_route_target_enum"]
          traffic_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_routing_flags_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_stage_issues: {
        Row: {
          created_at: string
          detail: string | null
          domain_id: string
          id: string
          issue_type: string
          metadata: Json
          occurred_at: string
          owner_role_code: string | null
          recovery_action: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["v2_cutover_issue_severity_enum"]
          stage_no: number
          stage_run_id: string | null
          status: Database["public"]["Enums"]["v2_cutover_issue_status_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain_id: string
          id?: string
          issue_type?: string
          metadata?: Json
          occurred_at?: string
          owner_role_code?: string | null
          recovery_action?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["v2_cutover_issue_severity_enum"]
          stage_no: number
          stage_run_id?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_issue_status_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain_id?: string
          id?: string
          issue_type?: string
          metadata?: Json
          occurred_at?: string
          owner_role_code?: string | null
          recovery_action?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["v2_cutover_issue_severity_enum"]
          stage_no?: number
          stage_run_id?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_issue_status_enum"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_stage_issues_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_cutover_stage_issues_stage_run_id_fkey"
            columns: ["stage_run_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_stage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_cutover_stage_runs: {
        Row: {
          approval_note: string | null
          created_at: string
          domain_id: string
          finished_at: string | null
          id: string
          limited_targets: Json
          metadata: Json
          run_key: string
          stage_no: number
          started_at: string | null
          status: Database["public"]["Enums"]["v2_cutover_stage_run_status_enum"]
          summary: Json
          transition_mode: string
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          created_at?: string
          domain_id: string
          finished_at?: string | null
          id?: string
          limited_targets?: Json
          metadata?: Json
          run_key: string
          stage_no: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_stage_run_status_enum"]
          summary?: Json
          transition_mode?: string
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          created_at?: string
          domain_id?: string
          finished_at?: string | null
          id?: string
          limited_targets?: Json
          metadata?: Json
          run_key?: string
          stage_no?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_cutover_stage_run_status_enum"]
          summary?: Json
          transition_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_cutover_stage_runs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v2_cutover_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_digital_assets: {
        Row: {
          asset_role: Database["public"]["Enums"]["v2_asset_role_enum"]
          checksum: string | null
          created_at: string
          deleted_at: string | null
          file_name: string
          file_size: number
          id: string
          media_asset_id: string | null
          metadata: Json
          mime_type: string
          status: Database["public"]["Enums"]["v2_digital_asset_status_enum"]
          storage_path: string
          updated_at: string
          variant_id: string
          version_no: number
        }
        Insert: {
          asset_role?: Database["public"]["Enums"]["v2_asset_role_enum"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          file_name: string
          file_size: number
          id?: string
          media_asset_id?: string | null
          metadata?: Json
          mime_type: string
          status?: Database["public"]["Enums"]["v2_digital_asset_status_enum"]
          storage_path: string
          updated_at?: string
          variant_id: string
          version_no?: number
        }
        Update: {
          asset_role?: Database["public"]["Enums"]["v2_asset_role_enum"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          file_size?: number
          id?: string
          media_asset_id?: string | null
          metadata?: Json
          mime_type?: string
          status?: Database["public"]["Enums"]["v2_digital_asset_status_enum"]
          storage_path?: string
          updated_at?: string
          variant_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "v2_digital_assets_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_digital_assets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_digital_entitlement_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          entitlement_id: string
          event_at: string
          event_type: Database["public"]["Enums"]["v2_digital_entitlement_event_type_enum"]
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entitlement_id: string
          event_at?: string
          event_type: Database["public"]["Enums"]["v2_digital_entitlement_event_type_enum"]
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entitlement_id?: string
          event_at?: string
          event_type?: Database["public"]["Enums"]["v2_digital_entitlement_event_type_enum"]
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "v2_digital_entitlement_events_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "v2_digital_entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_digital_entitlements: {
        Row: {
          access_type:
            | Database["public"]["Enums"]["v2_digital_access_type_enum"]
            | null
          created_at: string
          digital_asset_id: string | null
          download_count: number
          expires_at: string | null
          failed_at: string | null
          fulfillment_id: string | null
          granted_at: string | null
          id: string
          max_downloads: number | null
          metadata: Json
          order_id: string
          order_item_id: string
          revoke_reason: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["v2_digital_entitlement_status_enum"]
          token_hash: string | null
          token_reference: string | null
          updated_at: string
        }
        Insert: {
          access_type?:
            | Database["public"]["Enums"]["v2_digital_access_type_enum"]
            | null
          created_at?: string
          digital_asset_id?: string | null
          download_count?: number
          expires_at?: string | null
          failed_at?: string | null
          fulfillment_id?: string | null
          granted_at?: string | null
          id?: string
          max_downloads?: number | null
          metadata?: Json
          order_id: string
          order_item_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["v2_digital_entitlement_status_enum"]
          token_hash?: string | null
          token_reference?: string | null
          updated_at?: string
        }
        Update: {
          access_type?:
            | Database["public"]["Enums"]["v2_digital_access_type_enum"]
            | null
          created_at?: string
          digital_asset_id?: string | null
          download_count?: number
          expires_at?: string | null
          failed_at?: string | null
          fulfillment_id?: string | null
          granted_at?: string | null
          id?: string
          max_downloads?: number | null
          metadata?: Json
          order_id?: string
          order_item_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["v2_digital_entitlement_status_enum"]
          token_hash?: string | null
          token_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_digital_entitlements_digital_asset_id_fkey"
            columns: ["digital_asset_id"]
            isOneToOne: false
            referencedRelation: "v2_digital_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["fulfillment_id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "v2_fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_digital_entitlements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_fulfillment_group_items: {
        Row: {
          created_at: string
          fulfillment_group_id: string
          id: string
          metadata: Json
          order_item_id: string
          quantity_fulfilled: number
          quantity_planned: number
          status: Database["public"]["Enums"]["v2_fulfillment_group_item_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          fulfillment_group_id: string
          id?: string
          metadata?: Json
          order_item_id: string
          quantity_fulfilled?: number
          quantity_planned?: number
          status?: Database["public"]["Enums"]["v2_fulfillment_group_item_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          fulfillment_group_id?: string
          id?: string
          metadata?: Json
          order_item_id?: string
          quantity_fulfilled?: number
          quantity_planned?: number
          status?: Database["public"]["Enums"]["v2_fulfillment_group_item_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_fulfillment_group_items_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["fulfillment_group_id"]
          },
          {
            foreignKeyName: "v2_fulfillment_group_items_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_fulfillment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fulfillment_group_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_fulfillment_group_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_fulfillment_groups: {
        Row: {
          canceled_at: string | null
          created_at: string
          currency_code: string
          failure_reason: string | null
          fulfilled_at: string | null
          id: string
          kind: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata: Json
          order_id: string
          pickup_location_snapshot: Json | null
          planned_at: string
          shipping_address_snapshot: Json | null
          shipping_amount: number
          shipping_method_id: string | null
          shipping_profile_id: string | null
          shipping_zone_id: string | null
          status: Database["public"]["Enums"]["v2_fulfillment_group_status_enum"]
          stock_location_id: string | null
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          currency_code?: string
          failure_reason?: string | null
          fulfilled_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata?: Json
          order_id: string
          pickup_location_snapshot?: Json | null
          planned_at?: string
          shipping_address_snapshot?: Json | null
          shipping_amount?: number
          shipping_method_id?: string | null
          shipping_profile_id?: string | null
          shipping_zone_id?: string | null
          status?: Database["public"]["Enums"]["v2_fulfillment_group_status_enum"]
          stock_location_id?: string | null
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          currency_code?: string
          failure_reason?: string | null
          fulfilled_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata?: Json
          order_id?: string
          pickup_location_snapshot?: Json | null
          planned_at?: string
          shipping_address_snapshot?: Json | null
          shipping_amount?: number
          shipping_method_id?: string | null
          shipping_profile_id?: string | null
          shipping_zone_id?: string | null
          status?: Database["public"]["Enums"]["v2_fulfillment_group_status_enum"]
          stock_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_fulfillment_groups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_shipping_profile_id_fkey"
            columns: ["shipping_profile_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_shipping_zone_id_fkey"
            columns: ["shipping_zone_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "v2_stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_fulfillments: {
        Row: {
          canceled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_at: string | null
          failure_reason: string | null
          fulfillment_group_id: string
          id: string
          kind: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata: Json
          provider_ref: string | null
          provider_type: string
          requested_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["v2_fulfillment_execution_status_enum"]
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          fulfillment_group_id: string
          id?: string
          kind: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata?: Json
          provider_ref?: string | null
          provider_type?: string
          requested_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_fulfillment_execution_status_enum"]
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          fulfillment_group_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
          metadata?: Json
          provider_ref?: string | null
          provider_type?: string
          requested_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["v2_fulfillment_execution_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_fulfillments_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["fulfillment_group_id"]
          },
          {
            foreignKeyName: "v2_fulfillments_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_fulfillment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_inventory_levels: {
        Row: {
          available_quantity: number
          created_at: string
          id: string
          location_id: string
          metadata: Json
          on_hand_quantity: number
          reserved_quantity: number
          safety_stock_quantity: number
          updated_at: string
          updated_reason: string | null
          variant_id: string
        }
        Insert: {
          available_quantity?: number
          created_at?: string
          id?: string
          location_id: string
          metadata?: Json
          on_hand_quantity?: number
          reserved_quantity?: number
          safety_stock_quantity?: number
          updated_at?: string
          updated_reason?: string | null
          variant_id: string
        }
        Update: {
          available_quantity?: number
          created_at?: string
          id?: string
          location_id?: string
          metadata?: Json
          on_hand_quantity?: number
          reserved_quantity?: number
          safety_stock_quantity?: number
          updated_at?: string
          updated_reason?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v2_stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_inventory_reservations: {
        Row: {
          canceled_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string | null
          fulfillment_group_id: string | null
          id: string
          idempotency_key: string | null
          location_id: string
          metadata: Json
          order_id: string
          order_item_id: string
          quantity: number
          reason: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["v2_inventory_reservation_status_enum"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          canceled_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          fulfillment_group_id?: string | null
          id?: string
          idempotency_key?: string | null
          location_id: string
          metadata?: Json
          order_id: string
          order_item_id: string
          quantity?: number
          reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["v2_inventory_reservation_status_enum"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          canceled_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          fulfillment_group_id?: string | null
          id?: string
          idempotency_key?: string | null
          location_id?: string
          metadata?: Json
          order_id?: string
          order_item_id?: string
          quantity?: number
          reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["v2_inventory_reservation_status_enum"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_inventory_reservations_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["fulfillment_group_id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_fulfillment_group_id_fkey"
            columns: ["fulfillment_group_id"]
            isOneToOne: false
            referencedRelation: "v2_fulfillment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v2_stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_adjustments: {
        Row: {
          amount: number
          calculation_snapshot: Json
          code_snapshot: string | null
          created_at: string
          id: string
          label_snapshot: string
          order_id: string
          sequence_no: number
          source_id: string | null
          source_type: Database["public"]["Enums"]["v2_adjustment_source_enum"]
          target_scope: Database["public"]["Enums"]["v2_adjustment_scope_enum"]
        }
        Insert: {
          amount: number
          calculation_snapshot?: Json
          code_snapshot?: string | null
          created_at?: string
          id?: string
          label_snapshot: string
          order_id: string
          sequence_no?: number
          source_id?: string | null
          source_type: Database["public"]["Enums"]["v2_adjustment_source_enum"]
          target_scope: Database["public"]["Enums"]["v2_adjustment_scope_enum"]
        }
        Update: {
          amount?: number
          calculation_snapshot?: Json
          code_snapshot?: string | null
          created_at?: string
          id?: string
          label_snapshot?: string
          order_id?: string
          sequence_no?: number
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["v2_adjustment_source_enum"]
          target_scope?: Database["public"]["Enums"]["v2_adjustment_scope_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_financial_events: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          event_key: string
          event_type: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          id: string
          metadata: Json
          occurred_at: string
          order_id: string
          payment_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency_code?: string
          event_key: string
          event_type: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          id?: string
          metadata?: Json
          occurred_at: string
          order_id: string
          payment_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          event_key?: string
          event_type?: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          id?: string
          metadata?: Json
          occurred_at?: string
          order_id?: string
          payment_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_financial_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_financial_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_financial_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "v2_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_item_adjustments: {
        Row: {
          amount: number
          calculation_snapshot: Json
          created_at: string
          id: string
          label_snapshot: string
          order_item_id: string
          sequence_no: number
          source_id: string | null
          source_type: Database["public"]["Enums"]["v2_adjustment_source_enum"]
        }
        Insert: {
          amount: number
          calculation_snapshot?: Json
          created_at?: string
          id?: string
          label_snapshot: string
          order_item_id: string
          sequence_no?: number
          source_id?: string | null
          source_type: Database["public"]["Enums"]["v2_adjustment_source_enum"]
        }
        Update: {
          amount?: number
          calculation_snapshot?: Json
          created_at?: string
          id?: string
          label_snapshot?: string
          order_item_id?: string
          sequence_no?: number
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["v2_adjustment_source_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_item_adjustments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_order_item_adjustments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_item_financial_allocations: {
        Row: {
          allocated_amount: number
          allocation_policy_version: string
          created_at: string
          event_type: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          financial_event_id: string
          id: string
          metadata: Json
          order_id: string
          order_item_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          allocation_policy_version: string
          created_at?: string
          event_type: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          financial_event_id: string
          id?: string
          metadata?: Json
          order_id: string
          order_item_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          allocation_policy_version?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["v2_financial_event_type_enum"]
          financial_event_id?: string
          id?: string
          metadata?: Json
          order_id?: string
          order_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_item_financial_allocations_financial_event_id_fkey"
            columns: ["financial_event_id"]
            isOneToOne: false
            referencedRelation: "v2_order_financial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_items: {
        Row: {
          allocated_discount_amount: number
          allocated_unit_amount: number | null
          bundle_component_id_snapshot: string | null
          bundle_definition_id: string | null
          campaign_id_snapshot: string | null
          campaign_name_snapshot: string | null
          created_at: string
          currency_code: string
          discount_total: number
          display_snapshot: Json
          final_line_total: number
          final_unit_price: number
          fulfillment_type_snapshot:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id: string
          line_status: Database["public"]["Enums"]["v2_order_line_status_enum"]
          line_subtotal: number
          line_type: Database["public"]["Enums"]["v2_order_line_type_enum"]
          list_unit_price: number
          metadata: Json
          order_id: string
          parent_order_item_id: string | null
          product_id: string | null
          product_name_snapshot: string | null
          project_id_snapshot: string | null
          project_name_snapshot: string | null
          quantity: number
          requires_shipping_snapshot: boolean | null
          sale_unit_price: number
          sku_snapshot: string | null
          tax_total: number
          updated_at: string
          variant_id: string | null
          variant_name_snapshot: string | null
        }
        Insert: {
          allocated_discount_amount?: number
          allocated_unit_amount?: number | null
          bundle_component_id_snapshot?: string | null
          bundle_definition_id?: string | null
          campaign_id_snapshot?: string | null
          campaign_name_snapshot?: string | null
          created_at?: string
          currency_code?: string
          discount_total?: number
          display_snapshot?: Json
          final_line_total?: number
          final_unit_price?: number
          fulfillment_type_snapshot?:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id?: string
          line_status?: Database["public"]["Enums"]["v2_order_line_status_enum"]
          line_subtotal?: number
          line_type?: Database["public"]["Enums"]["v2_order_line_type_enum"]
          list_unit_price?: number
          metadata?: Json
          order_id: string
          parent_order_item_id?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          project_id_snapshot?: string | null
          project_name_snapshot?: string | null
          quantity?: number
          requires_shipping_snapshot?: boolean | null
          sale_unit_price?: number
          sku_snapshot?: string | null
          tax_total?: number
          updated_at?: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Update: {
          allocated_discount_amount?: number
          allocated_unit_amount?: number | null
          bundle_component_id_snapshot?: string | null
          bundle_definition_id?: string | null
          campaign_id_snapshot?: string | null
          campaign_name_snapshot?: string | null
          created_at?: string
          currency_code?: string
          discount_total?: number
          display_snapshot?: Json
          final_line_total?: number
          final_unit_price?: number
          fulfillment_type_snapshot?:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id?: string
          line_status?: Database["public"]["Enums"]["v2_order_line_status_enum"]
          line_subtotal?: number
          line_type?: Database["public"]["Enums"]["v2_order_line_type_enum"]
          list_unit_price?: number
          metadata?: Json
          order_id?: string
          parent_order_item_id?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          project_id_snapshot?: string | null
          project_name_snapshot?: string | null
          quantity?: number
          requires_shipping_snapshot?: boolean | null
          sale_unit_price?: number
          sku_snapshot?: string | null
          tax_total?: number
          updated_at?: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_items_bundle_component_id_snapshot_fkey"
            columns: ["bundle_component_id_snapshot"]
            isOneToOne: false
            referencedRelation: "v2_bundle_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_items_bundle_definition_id_fkey"
            columns: ["bundle_definition_id"]
            isOneToOne: false
            referencedRelation: "v2_bundle_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_items_parent_order_item_id_fkey"
            columns: ["parent_order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_order_items_parent_order_item_id_fkey"
            columns: ["parent_order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_order_notifications: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_type: Database["public"]["Enums"]["v2_order_notification_event_enum"]
          id: string
          metadata: Json
          order_id: string
          payload_json: Json
          provider: string
          provider_request_id: string | null
          recipient_phone: string | null
          response_json: Json
          sent_at: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["v2_order_notification_status_enum"]
          template_id: string | null
          updated_at: string
          variables_json: Json
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type: Database["public"]["Enums"]["v2_order_notification_event_enum"]
          id?: string
          metadata?: Json
          order_id: string
          payload_json?: Json
          provider?: string
          provider_request_id?: string | null
          recipient_phone?: string | null
          response_json?: Json
          sent_at?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["v2_order_notification_status_enum"]
          template_id?: string | null
          updated_at?: string
          variables_json?: Json
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: Database["public"]["Enums"]["v2_order_notification_event_enum"]
          id?: string
          metadata?: Json
          order_id?: string
          payload_json?: Json
          provider?: string
          provider_request_id?: string | null
          recipient_phone?: string | null
          response_json?: Json
          sent_at?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["v2_order_notification_status_enum"]
          template_id?: string | null
          updated_at?: string
          variables_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_notifications_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["shipment_id"]
          },
          {
            foreignKeyName: "v2_order_notifications_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v2_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_orders: {
        Row: {
          billing_address_snapshot: Json | null
          cancel_reason: string | null
          canceled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency_code: string
          customer_snapshot: Json
          fulfillment_status: Database["public"]["Enums"]["v2_fulfillment_status_enum"]
          grand_total: number
          guest_email_snapshot: string | null
          id: string
          idempotency_key: string
          item_discount_total: number
          metadata: Json
          order_discount_total: number
          order_no: string
          order_status: Database["public"]["Enums"]["v2_order_status_enum"]
          payment_status: Database["public"]["Enums"]["v2_payment_status_enum"]
          placed_at: string
          pricing_snapshot: Json
          profile_id: string | null
          sales_channel_id: string
          shipping_address_snapshot: Json | null
          shipping_amount: number
          shipping_discount_total: number
          source_cart_id: string | null
          subtotal_amount: number
          tax_total: number
          updated_at: string
        }
        Insert: {
          billing_address_snapshot?: Json | null
          cancel_reason?: string | null
          canceled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency_code?: string
          customer_snapshot?: Json
          fulfillment_status?: Database["public"]["Enums"]["v2_fulfillment_status_enum"]
          grand_total?: number
          guest_email_snapshot?: string | null
          id?: string
          idempotency_key: string
          item_discount_total?: number
          metadata?: Json
          order_discount_total?: number
          order_no: string
          order_status?: Database["public"]["Enums"]["v2_order_status_enum"]
          payment_status?: Database["public"]["Enums"]["v2_payment_status_enum"]
          placed_at?: string
          pricing_snapshot?: Json
          profile_id?: string | null
          sales_channel_id?: string
          shipping_address_snapshot?: Json | null
          shipping_amount?: number
          shipping_discount_total?: number
          source_cart_id?: string | null
          subtotal_amount?: number
          tax_total?: number
          updated_at?: string
        }
        Update: {
          billing_address_snapshot?: Json | null
          cancel_reason?: string | null
          canceled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency_code?: string
          customer_snapshot?: Json
          fulfillment_status?: Database["public"]["Enums"]["v2_fulfillment_status_enum"]
          grand_total?: number
          guest_email_snapshot?: string | null
          id?: string
          idempotency_key?: string
          item_discount_total?: number
          metadata?: Json
          order_discount_total?: number
          order_no?: string
          order_status?: Database["public"]["Enums"]["v2_order_status_enum"]
          payment_status?: Database["public"]["Enums"]["v2_payment_status_enum"]
          placed_at?: string
          pricing_snapshot?: Json
          profile_id?: string | null
          sales_channel_id?: string
          shipping_address_snapshot?: Json | null
          shipping_amount?: number
          shipping_discount_total?: number
          source_cart_id?: string | null
          subtotal_amount?: number
          tax_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_orders_source_cart_id_fkey"
            columns: ["source_cart_id"]
            isOneToOne: false
            referencedRelation: "v2_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_payments: {
        Row: {
          amount: number
          authorized_at: string | null
          captured_at: string | null
          created_at: string
          currency_code: string
          external_reference: string
          failed_at: string | null
          id: string
          metadata: Json
          method: string | null
          order_id: string
          provider: string
          refunded_total: number
          status: Database["public"]["Enums"]["v2_payment_status_enum"]
          updated_at: string
        }
        Insert: {
          amount?: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          currency_code?: string
          external_reference: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          order_id: string
          provider?: string
          refunded_total?: number
          status?: Database["public"]["Enums"]["v2_payment_status_enum"]
          updated_at?: string
        }
        Update: {
          amount?: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          currency_code?: string
          external_reference?: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          order_id?: string
          provider?: string
          refunded_total?: number
          status?: Database["public"]["Enums"]["v2_payment_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_price_list_items: {
        Row: {
          channel_scope_json: Json
          compare_at_amount: number | null
          created_at: string
          deleted_at: string | null
          ends_at: string | null
          id: string
          max_purchase_quantity: number | null
          metadata: Json
          min_purchase_quantity: number
          price_list_id: string
          product_id: string
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["v2_price_item_status_enum"]
          unit_amount: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          channel_scope_json?: Json
          compare_at_amount?: number | null
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          max_purchase_quantity?: number | null
          metadata?: Json
          min_purchase_quantity?: number
          price_list_id: string
          product_id: string
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_price_item_status_enum"]
          unit_amount: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          channel_scope_json?: Json
          compare_at_amount?: number | null
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          max_purchase_quantity?: number | null
          metadata?: Json
          min_purchase_quantity?: number
          price_list_id?: string
          product_id?: string
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_price_item_status_enum"]
          unit_amount?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "v2_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_price_list_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_price_lists: {
        Row: {
          campaign_id: string | null
          channel_scope_json: Json
          created_at: string
          currency_code: string
          deleted_at: string | null
          ends_at: string | null
          id: string
          metadata: Json
          name: string
          priority: number
          published_at: string | null
          rollback_of_price_list_id: string | null
          scope_type: Database["public"]["Enums"]["v2_price_list_scope_enum"]
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["v2_price_list_status_enum"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          channel_scope_json?: Json
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          name: string
          priority?: number
          published_at?: string | null
          rollback_of_price_list_id?: string | null
          scope_type?: Database["public"]["Enums"]["v2_price_list_scope_enum"]
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_price_list_status_enum"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          channel_scope_json?: Json
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          name?: string
          priority?: number
          published_at?: string | null
          rollback_of_price_list_id?: string | null
          scope_type?: Database["public"]["Enums"]["v2_price_list_scope_enum"]
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_price_list_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_price_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v2_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_price_lists_rollback_of_price_list_id_fkey"
            columns: ["rollback_of_price_list_id"]
            isOneToOne: false
            referencedRelation: "v2_price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_primary: boolean
          media_asset_id: string | null
          media_role: Database["public"]["Enums"]["v2_media_role_enum"]
          media_type: Database["public"]["Enums"]["v2_media_type_enum"]
          metadata: Json
          product_id: string
          public_url: string | null
          sort_order: number
          status: Database["public"]["Enums"]["v2_media_status_enum"]
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          media_asset_id?: string | null
          media_role?: Database["public"]["Enums"]["v2_media_role_enum"]
          media_type?: Database["public"]["Enums"]["v2_media_type_enum"]
          metadata?: Json
          product_id: string
          public_url?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_media_status_enum"]
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          media_asset_id?: string | null
          media_role?: Database["public"]["Enums"]["v2_media_role_enum"]
          media_type?: Database["public"]["Enums"]["v2_media_type_enum"]
          metadata?: Json
          product_id?: string
          public_url?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_media_status_enum"]
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_product_media_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_product_variants: {
        Row: {
          created_at: string
          deleted_at: string | null
          dimension_json: Json | null
          fulfillment_type: Database["public"]["Enums"]["v2_fulfillment_type_enum"]
          id: string
          metadata: Json
          option_summary_json: Json | null
          product_id: string
          requires_shipping: boolean
          sku: string
          status: Database["public"]["Enums"]["v2_variant_status_enum"]
          title: string
          track_inventory: boolean
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dimension_json?: Json | null
          fulfillment_type: Database["public"]["Enums"]["v2_fulfillment_type_enum"]
          id?: string
          metadata?: Json
          option_summary_json?: Json | null
          product_id: string
          requires_shipping?: boolean
          sku: string
          status?: Database["public"]["Enums"]["v2_variant_status_enum"]
          title: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dimension_json?: Json | null
          fulfillment_type?: Database["public"]["Enums"]["v2_fulfillment_type_enum"]
          id?: string
          metadata?: Json
          option_summary_json?: Json | null
          product_id?: string
          requires_shipping?: boolean
          sku?: string
          status?: Database["public"]["Enums"]["v2_variant_status_enum"]
          title?: string
          track_inventory?: boolean
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v2_products"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_products: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          fulfillment_type:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id: string
          legacy_product_id: string | null
          metadata: Json
          product_kind: Database["public"]["Enums"]["v2_product_kind_enum"]
          project_id: string
          short_description: string | null
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["v2_product_status_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id?: string
          legacy_product_id?: string | null
          metadata?: Json
          product_kind?: Database["public"]["Enums"]["v2_product_kind_enum"]
          project_id: string
          short_description?: string | null
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_product_status_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["v2_fulfillment_type_enum"]
            | null
          id?: string
          legacy_product_id?: string | null
          metadata?: Json
          product_kind?: Database["public"]["Enums"]["v2_product_kind_enum"]
          project_id?: string
          short_description?: string | null
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_product_status_enum"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_project_artists: {
        Row: {
          artist_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_primary: boolean
          metadata: Json
          project_id: string
          role: string
          sort_order: number
          status: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          project_id: string
          role?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          project_id?: string
          role?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_artist_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_project_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "v2_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_project_artists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_projects: {
        Row: {
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          legacy_project_id: string | null
          metadata: Json
          name: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["v2_project_status_enum"]
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          legacy_project_id?: string | null
          metadata?: Json
          name: string
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_project_status_enum"]
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          legacy_project_id?: string | null
          metadata?: Json
          name?: string
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["v2_project_status_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      v2_promotion_rules: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          promotion_id: string
          rule_payload: Json
          rule_type: Database["public"]["Enums"]["v2_promotion_rule_type_enum"]
          sort_order: number
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          status: Database["public"]["Enums"]["v2_price_item_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          promotion_id: string
          rule_payload?: Json
          rule_type: Database["public"]["Enums"]["v2_promotion_rule_type_enum"]
          sort_order?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          status?: Database["public"]["Enums"]["v2_price_item_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          promotion_id?: string
          rule_payload?: Json
          rule_type?: Database["public"]["Enums"]["v2_promotion_rule_type_enum"]
          sort_order?: number
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          status?: Database["public"]["Enums"]["v2_price_item_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_promotion_rules_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "v2_promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_promotions: {
        Row: {
          campaign_id: string | null
          channel_scope_json: Json
          combinability_mode: Database["public"]["Enums"]["v2_combinability_mode_enum"]
          coupon_required: boolean
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_value: number
          ends_at: string | null
          id: string
          max_discount_amount: number | null
          metadata: Json
          name: string
          priority: number
          promotion_type: Database["public"]["Enums"]["v2_promotion_type_enum"]
          purchase_limit_json: Json
          source_id: string | null
          source_snapshot_json: Json
          source_type: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["v2_promotion_status_enum"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          channel_scope_json?: Json
          combinability_mode?: Database["public"]["Enums"]["v2_combinability_mode_enum"]
          coupon_required?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_value: number
          ends_at?: string | null
          id?: string
          max_discount_amount?: number | null
          metadata?: Json
          name: string
          priority?: number
          promotion_type?: Database["public"]["Enums"]["v2_promotion_type_enum"]
          purchase_limit_json?: Json
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_promotion_status_enum"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          channel_scope_json?: Json
          combinability_mode?: Database["public"]["Enums"]["v2_combinability_mode_enum"]
          coupon_required?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_discount_amount?: number | null
          metadata?: Json
          name?: string
          priority?: number
          promotion_type?: Database["public"]["Enums"]["v2_promotion_type_enum"]
          purchase_limit_json?: Json
          source_id?: string | null
          source_snapshot_json?: Json
          source_type?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["v2_promotion_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_promotions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v2_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_shipment_items: {
        Row: {
          created_at: string
          fulfillment_group_item_id: string | null
          id: string
          order_item_id: string
          quantity: number
          shipment_id: string
        }
        Insert: {
          created_at?: string
          fulfillment_group_item_id?: string | null
          id?: string
          order_item_id: string
          quantity?: number
          shipment_id: string
        }
        Update: {
          created_at?: string
          fulfillment_group_item_id?: string | null
          id?: string
          order_item_id?: string
          quantity?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_shipment_items_fulfillment_group_item_id_fkey"
            columns: ["fulfillment_group_item_id"]
            isOneToOne: false
            referencedRelation: "v2_fulfillment_group_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["shipment_id"]
          },
          {
            foreignKeyName: "v2_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v2_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_shipments: {
        Row: {
          canceled_at: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          fulfillment_id: string
          id: string
          in_transit_at: string | null
          label_ref: string | null
          metadata: Json
          packed_at: string | null
          returned_at: string | null
          service_level: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["v2_shipment_status_enum"]
          tracking_no: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          fulfillment_id: string
          id?: string
          in_transit_at?: string | null
          label_ref?: string | null
          metadata?: Json
          packed_at?: string | null
          returned_at?: string | null
          service_level?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["v2_shipment_status_enum"]
          tracking_no?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          fulfillment_id?: string
          id?: string
          in_transit_at?: string | null
          label_ref?: string | null
          metadata?: Json
          packed_at?: string | null
          returned_at?: string | null
          service_level?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["v2_shipment_status_enum"]
          tracking_no?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_shipments_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: true
            referencedRelation: "v2_admin_fulfillment_queue_view"
            referencedColumns: ["fulfillment_id"]
          },
          {
            foreignKeyName: "v2_shipments_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: true
            referencedRelation: "v2_fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_shipping_methods: {
        Row: {
          carrier: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          method_type: Database["public"]["Enums"]["v2_shipping_method_type_enum"]
          name: string
          service_code: string | null
          supports_tracking: boolean
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          method_type?: Database["public"]["Enums"]["v2_shipping_method_type_enum"]
          name: string
          service_code?: string | null
          supports_tracking?: boolean
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          method_type?: Database["public"]["Enums"]["v2_shipping_method_type_enum"]
          name?: string
          service_code?: string | null
          supports_tracking?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      v2_shipping_profiles: {
        Row: {
          code: string
          created_at: string
          default_method_id: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          ship_mode: Database["public"]["Enums"]["v2_ship_mode_enum"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_method_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          ship_mode?: Database["public"]["Enums"]["v2_ship_mode_enum"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_method_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          ship_mode?: Database["public"]["Enums"]["v2_ship_mode_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_shipping_profiles_default_method_id_fkey"
            columns: ["default_method_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_shipping_rate_rules: {
        Row: {
          amount: number
          condition_type: Database["public"]["Enums"]["v2_shipping_condition_type_enum"]
          created_at: string
          currency_code: string
          ends_at: string | null
          id: string
          is_active: boolean
          max_value: number | null
          metadata: Json
          min_value: number | null
          priority: number
          shipping_method_id: string
          shipping_profile_id: string | null
          shipping_zone_id: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          condition_type?: Database["public"]["Enums"]["v2_shipping_condition_type_enum"]
          created_at?: string
          currency_code?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_value?: number | null
          metadata?: Json
          min_value?: number | null
          priority?: number
          shipping_method_id: string
          shipping_profile_id?: string | null
          shipping_zone_id: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          condition_type?: Database["public"]["Enums"]["v2_shipping_condition_type_enum"]
          created_at?: string
          currency_code?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_value?: number | null
          metadata?: Json
          min_value?: number | null
          priority?: number
          shipping_method_id?: string
          shipping_profile_id?: string | null
          shipping_zone_id?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_shipping_rate_rules_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_shipping_rate_rules_shipping_profile_id_fkey"
            columns: ["shipping_profile_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_shipping_rate_rules_shipping_zone_id_fkey"
            columns: ["shipping_zone_id"]
            isOneToOne: false
            referencedRelation: "v2_shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_shipping_zones: {
        Row: {
          code: string
          country_codes: string[]
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          postal_code_patterns: string[]
          priority: number
          region_codes: string[]
          updated_at: string
        }
        Insert: {
          code: string
          country_codes?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          postal_code_patterns?: string[]
          priority?: number
          region_codes?: string[]
          updated_at?: string
        }
        Update: {
          code?: string
          country_codes?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          postal_code_patterns?: string[]
          priority?: number
          region_codes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      v2_stock_locations: {
        Row: {
          address_snapshot: Json
          code: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          location_type: Database["public"]["Enums"]["v2_stock_location_type_enum"]
          metadata: Json
          name: string
          priority: number
          region_code: string | null
          updated_at: string
        }
        Insert: {
          address_snapshot?: Json
          code: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["v2_stock_location_type_enum"]
          metadata?: Json
          name: string
          priority?: number
          region_code?: string | null
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["v2_stock_location_type_enum"]
          metadata?: Json
          name?: string
          priority?: number
          region_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v2_admin_financial_allocation_facts_view: {
        Row: {
          allocated_amount: number | null
          allocation_id: string | null
          allocation_policy_version: string | null
          campaign_id_snapshot: string | null
          campaign_name_snapshot: string | null
          campaign_type:
            | Database["public"]["Enums"]["v2_campaign_type_enum"]
            | null
          currency_code: string | null
          event_key: string | null
          event_type:
            | Database["public"]["Enums"]["v2_financial_event_type_enum"]
            | null
          financial_event_id: string | null
          occurred_at: string | null
          occurred_date: string | null
          order_id: string | null
          order_item_id: string | null
          order_no: string | null
          payment_id: string | null
          project_id_snapshot: string | null
          project_name_snapshot: string | null
          sales_channel_id: string | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_financial_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "v2_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_financial_event_id_fkey"
            columns: ["financial_event_id"]
            isOneToOne: false
            referencedRelation: "v2_order_financial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_sales_item_facts_view"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "v2_order_item_financial_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v2_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_fulfillment_queue_view: {
        Row: {
          active_entitlement_count: number | null
          active_reserved_quantity: number | null
          fulfillment_group_id: string | null
          fulfillment_group_status:
            | Database["public"]["Enums"]["v2_fulfillment_group_status_enum"]
            | null
          fulfillment_id: string | null
          fulfillment_kind:
            | Database["public"]["Enums"]["v2_fulfillment_group_kind_enum"]
            | null
          fulfillment_status:
            | Database["public"]["Enums"]["v2_fulfillment_execution_status_enum"]
            | null
          order_id: string | null
          shipment_id: string | null
          shipment_status:
            | Database["public"]["Enums"]["v2_shipment_status_enum"]
            | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_fulfillment_groups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_fulfillment_groups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_inventory_health_view: {
        Row: {
          active_reservation_quantity: number | null
          available_quantity: number | null
          inventory_level_id: string | null
          location_id: string | null
          on_hand_quantity: number | null
          reservation_delta: number | null
          reserved_quantity: number | null
          safety_stock_quantity: number | null
          updated_at: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v2_stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v2_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_admin_order_queue_view: {
        Row: {
          active_entitlement_count: number | null
          active_shipment_count: number | null
          created_at: string | null
          delivered_shipment_count: number | null
          fulfillment_group_count: number | null
          fulfillment_status:
            | Database["public"]["Enums"]["v2_fulfillment_status_enum"]
            | null
          grand_total: number | null
          has_bundle: boolean | null
          has_digital: boolean | null
          has_physical: boolean | null
          in_transit_shipment_count: number | null
          order_id: string | null
          order_no: string | null
          order_status:
            | Database["public"]["Enums"]["v2_order_status_enum"]
            | null
          payment_status:
            | Database["public"]["Enums"]["v2_payment_status_enum"]
            | null
          placed_at: string | null
          sales_channel_id: string | null
          waiting_shipment_count: number | null
        }
        Relationships: []
      }
      v2_admin_sales_item_facts_view: {
        Row: {
          campaign_id_snapshot: string | null
          campaign_name_snapshot: string | null
          campaign_type:
            | Database["public"]["Enums"]["v2_campaign_type_enum"]
            | null
          currency_code: string | null
          final_line_total: number | null
          line_type:
            | Database["public"]["Enums"]["v2_order_line_type_enum"]
            | null
          order_id: string | null
          order_item_id: string | null
          order_no: string | null
          order_status:
            | Database["public"]["Enums"]["v2_order_status_enum"]
            | null
          payment_status:
            | Database["public"]["Enums"]["v2_payment_status_enum"]
            | null
          placed_at: string | null
          placed_date: string | null
          project_id_snapshot: string | null
          project_name_snapshot: string | null
          quantity: number | null
          sales_channel_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_admin_order_queue_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "v2_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v2_orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      increment_verification_attempts: {
        Args: { p_email: string }
        Returns: undefined
      }
    }
    Enums: {
      order_item_line_type: "STANDARD" | "BUNDLE_PARENT" | "BUNDLE_COMPONENT"
      order_status:
        | "PENDING"
        | "PAID"
        | "MAKING"
        | "READY_TO_SHIP"
        | "SHIPPING"
        | "DONE"
      product_type: "VOICE_PACK" | "PHYSICAL_GOODS" | "BUNDLE"
      v2_adjustment_scope_enum: "ORDER" | "SHIPPING"
      v2_adjustment_source_enum:
        | "PRICE_LIST"
        | "PROMOTION"
        | "COUPON"
        | "BUNDLE_ALLOC"
        | "MANUAL"
        | "ETC"
      v2_admin_action_status_enum:
        | "PENDING"
        | "SUCCEEDED"
        | "FAILED"
        | "REJECTED"
        | "CANCELED"
      v2_admin_approval_status_enum:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "CANCELED"
      v2_admin_note_visibility_enum: "INTERNAL" | "CS" | "FINANCE" | "SECURITY"
      v2_artist_status_enum: "DRAFT" | "ACTIVE" | "ARCHIVED"
      v2_asset_role_enum: "PRIMARY" | "BONUS"
      v2_bundle_mode_enum: "FIXED" | "CUSTOMIZABLE"
      v2_bundle_pricing_strategy_enum: "WEIGHTED" | "FIXED_AMOUNT"
      v2_bundle_status_enum: "DRAFT" | "ACTIVE" | "ARCHIVED"
      v2_campaign_status_enum:
        | "DRAFT"
        | "ACTIVE"
        | "SUSPENDED"
        | "CLOSED"
        | "ARCHIVED"
      v2_campaign_target_type_enum:
        | "PROJECT"
        | "PRODUCT"
        | "VARIANT"
        | "BUNDLE_DEFINITION"
      v2_campaign_type_enum: "POPUP" | "EVENT" | "SALE" | "DROP" | "ALWAYS_ON"
      v2_cart_status_enum: "ACTIVE" | "CONVERTED" | "EXPIRED" | "ABANDONED"
      v2_combinability_mode_enum: "STACKABLE" | "EXCLUSIVE"
      v2_coupon_redemption_status_enum:
        | "RESERVED"
        | "APPLIED"
        | "RELEASED"
        | "CANCELED"
        | "EXPIRED"
      v2_coupon_status_enum:
        | "DRAFT"
        | "ACTIVE"
        | "PAUSED"
        | "EXHAUSTED"
        | "EXPIRED"
        | "ARCHIVED"
      v2_cutover_batch_status_enum:
        | "PENDING"
        | "RUNNING"
        | "SUCCEEDED"
        | "FAILED"
        | "CANCELED"
      v2_cutover_gate_result_enum: "PASS" | "FAIL" | "WARN" | "SKIP"
      v2_cutover_gate_type_enum:
        | "DATA_CONSISTENCY"
        | "BEHAVIORAL"
        | "OPERATIONS"
        | "ROLLBACK_READY"
      v2_cutover_issue_severity_enum: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      v2_cutover_issue_status_enum: "OPEN" | "MITIGATING" | "RESOLVED"
      v2_cutover_route_target_enum: "LEGACY" | "V2" | "SHADOW"
      v2_cutover_stage_run_status_enum:
        | "PLANNED"
        | "RUNNING"
        | "COMPLETED"
        | "BLOCKED"
        | "ROLLED_BACK"
        | "CANCELED"
      v2_cutover_status_enum:
        | "NOT_STARTED"
        | "SCHEMA_READY"
        | "BACKFILL_DONE"
        | "SHADOW_VERIFIED"
        | "LIMITED_CUTOVER"
        | "WRITE_DEFAULT_V2"
        | "LEGACY_READONLY"
      v2_digital_access_type_enum: "DOWNLOAD" | "STREAM" | "LICENSE"
      v2_digital_asset_status_enum: "DRAFT" | "READY" | "RETIRED"
      v2_digital_entitlement_event_type_enum:
        | "GRANTED"
        | "DOWNLOADED"
        | "REISSUED"
        | "REVOKED"
        | "EXPIRED"
      v2_digital_entitlement_status_enum:
        | "PENDING"
        | "GRANTED"
        | "EXPIRED"
        | "REVOKED"
        | "FAILED"
      v2_financial_event_type_enum:
        | "CAPTURE"
        | "REFUND"
        | "CHARGEBACK"
        | "FEE"
        | "ADJUSTMENT"
      v2_fulfillment_execution_status_enum:
        | "REQUESTED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "FAILED"
        | "CANCELED"
      v2_fulfillment_group_item_status_enum:
        | "PLANNED"
        | "ALLOCATED"
        | "PARTIAL"
        | "FULFILLED"
        | "CANCELED"
      v2_fulfillment_group_kind_enum: "DIGITAL" | "SHIPMENT" | "PICKUP"
      v2_fulfillment_group_status_enum:
        | "PLANNED"
        | "ALLOCATED"
        | "PARTIALLY_FULFILLED"
        | "FULFILLED"
        | "CANCELED"
        | "FAILED"
      v2_fulfillment_status_enum:
        | "UNFULFILLED"
        | "PARTIAL"
        | "FULFILLED"
        | "CANCELED"
      v2_fulfillment_type_enum: "DIGITAL" | "PHYSICAL"
      v2_inventory_reservation_status_enum:
        | "ACTIVE"
        | "RELEASED"
        | "CONSUMED"
        | "CANCELED"
      v2_media_asset_kind_enum:
        | "IMAGE"
        | "VIDEO"
        | "AUDIO"
        | "DOCUMENT"
        | "ARCHIVE"
        | "FILE"
      v2_media_asset_status_enum: "ACTIVE" | "INACTIVE" | "ARCHIVED"
      v2_media_asset_upload_session_status_enum:
        | "INITIATED"
        | "UPLOADING"
        | "COMPLETING"
        | "COMPLETED"
        | "ABORTED"
        | "FAILED"
        | "EXPIRED"
      v2_media_role_enum: "PRIMARY" | "GALLERY" | "DETAIL"
      v2_media_status_enum: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
      v2_media_type_enum: "IMAGE" | "VIDEO"
      v2_order_line_status_enum:
        | "PENDING"
        | "CONFIRMED"
        | "CANCELED"
        | "FULFILLED"
        | "PARTIALLY_REFUNDED"
        | "REFUNDED"
      v2_order_line_type_enum: "STANDARD" | "BUNDLE_PARENT" | "BUNDLE_COMPONENT"
      v2_order_notification_event_enum:
        | "ORDER_PLACED"
        | "PAYMENT_CAPTURED"
        | "SHIPMENT_DISPATCHED"
        | "SHIPMENT_DELIVERED"
      v2_order_notification_status_enum:
        | "ACCEPTED"
        | "FAILED"
        | "DISABLED"
        | "SKIPPED"
      v2_order_status_enum: "PENDING" | "CONFIRMED" | "CANCELED" | "COMPLETED"
      v2_payment_status_enum:
        | "PENDING"
        | "AUTHORIZED"
        | "CAPTURED"
        | "FAILED"
        | "CANCELED"
        | "PARTIALLY_REFUNDED"
        | "REFUNDED"
      v2_price_item_status_enum: "ACTIVE" | "INACTIVE"
      v2_price_list_scope_enum: "BASE" | "OVERRIDE"
      v2_price_list_status_enum:
        | "DRAFT"
        | "PUBLISHED"
        | "ROLLED_BACK"
        | "ARCHIVED"
      v2_product_kind_enum: "STANDARD" | "BUNDLE"
      v2_product_status_enum: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
      v2_project_status_enum: "DRAFT" | "ACTIVE" | "ARCHIVED"
      v2_promotion_rule_type_enum:
        | "MIN_ORDER_AMOUNT"
        | "MIN_ITEM_QUANTITY"
        | "TARGET_PROJECT"
        | "TARGET_PRODUCT"
        | "TARGET_VARIANT"
        | "TARGET_BUNDLE"
        | "CHANNEL"
        | "USER_SEGMENT"
      v2_promotion_status_enum: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"
      v2_promotion_type_enum:
        | "ITEM_PERCENT"
        | "ITEM_FIXED"
        | "ORDER_PERCENT"
        | "ORDER_FIXED"
        | "SHIPPING_PERCENT"
        | "SHIPPING_FIXED"
      v2_ship_mode_enum: "TOGETHER" | "SEPARATELY"
      v2_shipment_status_enum:
        | "READY_TO_PACK"
        | "PACKING"
        | "SHIPPED"
        | "IN_TRANSIT"
        | "DELIVERED"
        | "RETURNED"
        | "CANCELED"
      v2_shipping_condition_type_enum:
        | "FLAT"
        | "ORDER_AMOUNT"
        | "WEIGHT"
        | "ITEM_COUNT"
      v2_shipping_method_type_enum: "STANDARD" | "EXPRESS" | "PICKUP"
      v2_stock_location_type_enum: "WAREHOUSE" | "POPUP" | "STORE" | "VENDOR"
      v2_variant_status_enum: "DRAFT" | "ACTIVE" | "INACTIVE"
      verification_purpose: "signup" | "reset_password" | "change_email"
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
      order_item_line_type: ["STANDARD", "BUNDLE_PARENT", "BUNDLE_COMPONENT"],
      order_status: [
        "PENDING",
        "PAID",
        "MAKING",
        "READY_TO_SHIP",
        "SHIPPING",
        "DONE",
      ],
      product_type: ["VOICE_PACK", "PHYSICAL_GOODS", "BUNDLE"],
      v2_adjustment_scope_enum: ["ORDER", "SHIPPING"],
      v2_adjustment_source_enum: [
        "PRICE_LIST",
        "PROMOTION",
        "COUPON",
        "BUNDLE_ALLOC",
        "MANUAL",
        "ETC",
      ],
      v2_admin_action_status_enum: [
        "PENDING",
        "SUCCEEDED",
        "FAILED",
        "REJECTED",
        "CANCELED",
      ],
      v2_admin_approval_status_enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CANCELED",
      ],
      v2_admin_note_visibility_enum: ["INTERNAL", "CS", "FINANCE", "SECURITY"],
      v2_artist_status_enum: ["DRAFT", "ACTIVE", "ARCHIVED"],
      v2_asset_role_enum: ["PRIMARY", "BONUS"],
      v2_bundle_mode_enum: ["FIXED", "CUSTOMIZABLE"],
      v2_bundle_pricing_strategy_enum: ["WEIGHTED", "FIXED_AMOUNT"],
      v2_bundle_status_enum: ["DRAFT", "ACTIVE", "ARCHIVED"],
      v2_campaign_status_enum: [
        "DRAFT",
        "ACTIVE",
        "SUSPENDED",
        "CLOSED",
        "ARCHIVED",
      ],
      v2_campaign_target_type_enum: [
        "PROJECT",
        "PRODUCT",
        "VARIANT",
        "BUNDLE_DEFINITION",
      ],
      v2_campaign_type_enum: ["POPUP", "EVENT", "SALE", "DROP", "ALWAYS_ON"],
      v2_cart_status_enum: ["ACTIVE", "CONVERTED", "EXPIRED", "ABANDONED"],
      v2_combinability_mode_enum: ["STACKABLE", "EXCLUSIVE"],
      v2_coupon_redemption_status_enum: [
        "RESERVED",
        "APPLIED",
        "RELEASED",
        "CANCELED",
        "EXPIRED",
      ],
      v2_coupon_status_enum: [
        "DRAFT",
        "ACTIVE",
        "PAUSED",
        "EXHAUSTED",
        "EXPIRED",
        "ARCHIVED",
      ],
      v2_cutover_batch_status_enum: [
        "PENDING",
        "RUNNING",
        "SUCCEEDED",
        "FAILED",
        "CANCELED",
      ],
      v2_cutover_gate_result_enum: ["PASS", "FAIL", "WARN", "SKIP"],
      v2_cutover_gate_type_enum: [
        "DATA_CONSISTENCY",
        "BEHAVIORAL",
        "OPERATIONS",
        "ROLLBACK_READY",
      ],
      v2_cutover_issue_severity_enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      v2_cutover_issue_status_enum: ["OPEN", "MITIGATING", "RESOLVED"],
      v2_cutover_route_target_enum: ["LEGACY", "V2", "SHADOW"],
      v2_cutover_stage_run_status_enum: [
        "PLANNED",
        "RUNNING",
        "COMPLETED",
        "BLOCKED",
        "ROLLED_BACK",
        "CANCELED",
      ],
      v2_cutover_status_enum: [
        "NOT_STARTED",
        "SCHEMA_READY",
        "BACKFILL_DONE",
        "SHADOW_VERIFIED",
        "LIMITED_CUTOVER",
        "WRITE_DEFAULT_V2",
        "LEGACY_READONLY",
      ],
      v2_digital_access_type_enum: ["DOWNLOAD", "STREAM", "LICENSE"],
      v2_digital_asset_status_enum: ["DRAFT", "READY", "RETIRED"],
      v2_digital_entitlement_event_type_enum: [
        "GRANTED",
        "DOWNLOADED",
        "REISSUED",
        "REVOKED",
        "EXPIRED",
      ],
      v2_digital_entitlement_status_enum: [
        "PENDING",
        "GRANTED",
        "EXPIRED",
        "REVOKED",
        "FAILED",
      ],
      v2_financial_event_type_enum: [
        "CAPTURE",
        "REFUND",
        "CHARGEBACK",
        "FEE",
        "ADJUSTMENT",
      ],
      v2_fulfillment_execution_status_enum: [
        "REQUESTED",
        "IN_PROGRESS",
        "COMPLETED",
        "FAILED",
        "CANCELED",
      ],
      v2_fulfillment_group_item_status_enum: [
        "PLANNED",
        "ALLOCATED",
        "PARTIAL",
        "FULFILLED",
        "CANCELED",
      ],
      v2_fulfillment_group_kind_enum: ["DIGITAL", "SHIPMENT", "PICKUP"],
      v2_fulfillment_group_status_enum: [
        "PLANNED",
        "ALLOCATED",
        "PARTIALLY_FULFILLED",
        "FULFILLED",
        "CANCELED",
        "FAILED",
      ],
      v2_fulfillment_status_enum: [
        "UNFULFILLED",
        "PARTIAL",
        "FULFILLED",
        "CANCELED",
      ],
      v2_fulfillment_type_enum: ["DIGITAL", "PHYSICAL"],
      v2_inventory_reservation_status_enum: [
        "ACTIVE",
        "RELEASED",
        "CONSUMED",
        "CANCELED",
      ],
      v2_media_asset_kind_enum: [
        "IMAGE",
        "VIDEO",
        "AUDIO",
        "DOCUMENT",
        "ARCHIVE",
        "FILE",
      ],
      v2_media_asset_status_enum: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      v2_media_asset_upload_session_status_enum: [
        "INITIATED",
        "UPLOADING",
        "COMPLETING",
        "COMPLETED",
        "ABORTED",
        "FAILED",
        "EXPIRED",
      ],
      v2_media_role_enum: ["PRIMARY", "GALLERY", "DETAIL"],
      v2_media_status_enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
      v2_media_type_enum: ["IMAGE", "VIDEO"],
      v2_order_line_status_enum: [
        "PENDING",
        "CONFIRMED",
        "CANCELED",
        "FULFILLED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
      ],
      v2_order_line_type_enum: [
        "STANDARD",
        "BUNDLE_PARENT",
        "BUNDLE_COMPONENT",
      ],
      v2_order_notification_event_enum: [
        "ORDER_PLACED",
        "PAYMENT_CAPTURED",
        "SHIPMENT_DISPATCHED",
        "SHIPMENT_DELIVERED",
      ],
      v2_order_notification_status_enum: [
        "ACCEPTED",
        "FAILED",
        "DISABLED",
        "SKIPPED",
      ],
      v2_order_status_enum: ["PENDING", "CONFIRMED", "CANCELED", "COMPLETED"],
      v2_payment_status_enum: [
        "PENDING",
        "AUTHORIZED",
        "CAPTURED",
        "FAILED",
        "CANCELED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
      ],
      v2_price_item_status_enum: ["ACTIVE", "INACTIVE"],
      v2_price_list_scope_enum: ["BASE", "OVERRIDE"],
      v2_price_list_status_enum: [
        "DRAFT",
        "PUBLISHED",
        "ROLLED_BACK",
        "ARCHIVED",
      ],
      v2_product_kind_enum: ["STANDARD", "BUNDLE"],
      v2_product_status_enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
      v2_project_status_enum: ["DRAFT", "ACTIVE", "ARCHIVED"],
      v2_promotion_rule_type_enum: [
        "MIN_ORDER_AMOUNT",
        "MIN_ITEM_QUANTITY",
        "TARGET_PROJECT",
        "TARGET_PRODUCT",
        "TARGET_VARIANT",
        "TARGET_BUNDLE",
        "CHANNEL",
        "USER_SEGMENT",
      ],
      v2_promotion_status_enum: ["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"],
      v2_promotion_type_enum: [
        "ITEM_PERCENT",
        "ITEM_FIXED",
        "ORDER_PERCENT",
        "ORDER_FIXED",
        "SHIPPING_PERCENT",
        "SHIPPING_FIXED",
      ],
      v2_ship_mode_enum: ["TOGETHER", "SEPARATELY"],
      v2_shipment_status_enum: [
        "READY_TO_PACK",
        "PACKING",
        "SHIPPED",
        "IN_TRANSIT",
        "DELIVERED",
        "RETURNED",
        "CANCELED",
      ],
      v2_shipping_condition_type_enum: [
        "FLAT",
        "ORDER_AMOUNT",
        "WEIGHT",
        "ITEM_COUNT",
      ],
      v2_shipping_method_type_enum: ["STANDARD", "EXPRESS", "PICKUP"],
      v2_stock_location_type_enum: ["WAREHOUSE", "POPUP", "STORE", "VENDOR"],
      v2_variant_status_enum: ["DRAFT", "ACTIVE", "INACTIVE"],
      verification_purpose: ["signup", "reset_password", "change_email"],
    },
  },
} as const
