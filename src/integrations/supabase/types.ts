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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      deleted_expenses: {
        Row: {
          amount: number
          can_restore: boolean | null
          category: string
          deleted_at: string
          deleted_reason: string | null
          description: string | null
          expense_date: string
          expense_time: string | null
          id: string
          merchant: string | null
          original_expense_id: string
          project: string | null
          receipt_url: string | null
          receiver: string | null
          sender: string | null
          subcategory: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          can_restore?: boolean | null
          category: string
          deleted_at?: string
          deleted_reason?: string | null
          description?: string | null
          expense_date: string
          expense_time?: string | null
          id?: string
          merchant?: string | null
          original_expense_id: string
          project?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          subcategory?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          can_restore?: boolean | null
          category?: string
          deleted_at?: string
          deleted_reason?: string | null
          description?: string | null
          expense_date?: string
          expense_time?: string | null
          id?: string
          merchant?: string | null
          original_expense_id?: string
          project?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          subcategory?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          expense_time: string | null
          id: string
          merchant: string | null
          non_duplicate_pairs: string[] | null
          project: string | null
          receipt_url: string | null
          receiver: string | null
          sender: string | null
          subcategory: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          expense_date: string
          expense_time?: string | null
          id?: string
          merchant?: string | null
          non_duplicate_pairs?: string[] | null
          project?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          subcategory?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_time?: string | null
          id?: string
          merchant?: string | null
          non_duplicate_pairs?: string[] | null
          project?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          subcategory?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      import_history: {
        Row: {
          error_count: number
          file_name: string | null
          id: string
          import_type: string
          imported_at: string
          notes: string | null
          rolled_back_at: string | null
          status: string
          success_count: number
          total_rows: number
          update_count: number
          user_id: string
        }
        Insert: {
          error_count?: number
          file_name?: string | null
          id?: string
          import_type?: string
          imported_at?: string
          notes?: string | null
          rolled_back_at?: string | null
          status?: string
          success_count?: number
          total_rows?: number
          update_count?: number
          user_id: string
        }
        Update: {
          error_count?: number
          file_name?: string | null
          id?: string
          import_type?: string
          imported_at?: string
          notes?: string | null
          rolled_back_at?: string | null
          status?: string
          success_count?: number
          total_rows?: number
          update_count?: number
          user_id?: string
        }
        Relationships: []
      }
      import_items: {
        Row: {
          action_type: string
          created_at: string
          expense_id: string
          id: string
          import_history_id: string
          row_data: Json | null
          row_number: number | null
        }
        Insert: {
          action_type: string
          created_at?: string
          expense_id: string
          id?: string
          import_history_id: string
          row_data?: Json | null
          row_number?: number | null
        }
        Update: {
          action_type?: string
          created_at?: string
          expense_id?: string
          id?: string
          import_history_id?: string
          row_data?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_items_import_history_id_fkey"
            columns: ["import_history_id"]
            isOneToOne: false
            referencedRelation: "import_history"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
