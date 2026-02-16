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
      order_items: {
        Row: {
          created_at: string
          download_count: number
          download_url: string | null
          id: string
          item_status: Database["public"]["Enums"]["order_item_status"]
          last_downloaded_at: string | null
          order_id: string
          price_snapshot: number
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
        }
        Insert: {
          created_at?: string
          download_count?: number
          download_url?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_item_status"]
          last_downloaded_at?: string | null
          order_id: string
          price_snapshot: number
          product_id: string
          product_name: string
          product_type: Database["public"]["Enums"]["product_type"]
          quantity?: number
        }
        Update: {
          created_at?: string
          download_count?: number
          download_url?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_item_status"]
          last_downloaded_at?: string | null
          order_id?: string
          price_snapshot?: number
          product_id?: string
          product_name?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          main_address: string | null
          name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail_address?: string | null
          email: string
          id: string
          main_address?: string | null
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail_address?: string | null
          email?: string
          id?: string
          main_address?: string | null
          name?: string | null
          phone?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_verification_attempts: {
        Args: { p_email: string }
        Returns: undefined
      }
    }
    Enums: {
      order_item_status:
        | "PENDING"
        | "PROCESSING"
        | "READY"
        | "SHIPPED"
        | "DELIVERED"
        | "COMPLETED"
      order_status:
        | "PENDING"
        | "PAID"
        | "MAKING"
        | "READY_TO_SHIP"
        | "SHIPPING"
        | "DONE"
      product_type: "VOICE_PACK" | "PHYSICAL_GOODS" | "BUNDLE"
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
      order_item_status: [
        "PENDING",
        "PROCESSING",
        "READY",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
      ],
      order_status: [
        "PENDING",
        "PAID",
        "MAKING",
        "READY_TO_SHIP",
        "SHIPPING",
        "DONE",
      ],
      product_type: ["VOICE_PACK", "PHYSICAL_GOODS", "BUNDLE"],
      verification_purpose: ["signup", "reset_password", "change_email"],
    },
  },
} as const
