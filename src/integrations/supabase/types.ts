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
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          entity: string | null
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          entity?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          entity?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_advance_clearances: {
        Row: {
          advance_id: string
          amount: number
          clear_date: string
          created_at: string
          description: string | null
          expense_id: string | null
          has_formal_receipt: boolean
          id: string
          notes: string | null
          receipt_url: string | null
          refund_amount: number
          submitted_via: string | null
          substitute_receipt_url: string | null
          user_id: string
        }
        Insert: {
          advance_id: string
          amount?: number
          clear_date?: string
          created_at?: string
          description?: string | null
          expense_id?: string | null
          has_formal_receipt?: boolean
          id?: string
          notes?: string | null
          receipt_url?: string | null
          refund_amount?: number
          submitted_via?: string | null
          substitute_receipt_url?: string | null
          user_id: string
        }
        Update: {
          advance_id?: string
          amount?: number
          clear_date?: string
          created_at?: string
          description?: string | null
          expense_id?: string | null
          has_formal_receipt?: boolean
          id?: string
          notes?: string | null
          receipt_url?: string | null
          refund_amount?: number
          submitted_via?: string | null
          substitute_receipt_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_advance_clearances_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "cash_advances"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_advances: {
        Row: {
          advance_date: string
          amount: number
          cleared_amount: number
          created_at: string
          event_id: string | null
          event_name: string | null
          id: string
          notes: string | null
          payment_slip_url: string | null
          project_tag: string | null
          purpose: string | null
          recipient_id: string | null
          recipient_line_user_id: string | null
          recipient_name: string
          recipient_type: string
          source_expense_id: string | null
          status: string
          submitted_via: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          advance_date?: string
          amount?: number
          cleared_amount?: number
          created_at?: string
          event_id?: string | null
          event_name?: string | null
          id?: string
          notes?: string | null
          payment_slip_url?: string | null
          project_tag?: string | null
          purpose?: string | null
          recipient_id?: string | null
          recipient_line_user_id?: string | null
          recipient_name: string
          recipient_type?: string
          source_expense_id?: string | null
          status?: string
          submitted_via?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          advance_date?: string
          amount?: number
          cleared_amount?: number
          created_at?: string
          event_id?: string | null
          event_name?: string | null
          id?: string
          notes?: string | null
          payment_slip_url?: string | null
          project_tag?: string | null
          purpose?: string | null
          recipient_id?: string | null
          recipient_line_user_id?: string | null
          recipient_name?: string
          recipient_type?: string
          source_expense_id?: string | null
          status?: string
          submitted_via?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deleted_expenses: {
        Row: {
          amount: number
          can_restore: boolean | null
          category: string
          category_group: string | null
          confidence_score: number | null
          days_worked: number | null
          deleted_at: string
          deleted_reason: string | null
          description: string | null
          event_name: string | null
          expense_date: string
          expense_time: string | null
          id: string
          is_cash: boolean | null
          memo_text: string | null
          merchant: string | null
          needs_review: boolean | null
          original_expense_id: string
          payee_group: string | null
          project: string | null
          project_tag: string | null
          receipt_url: string | null
          receiver: string | null
          sender: string | null
          staff_name: string | null
          subcategory: string | null
          transaction_direction: string
          transaction_id: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          can_restore?: boolean | null
          category: string
          category_group?: string | null
          confidence_score?: number | null
          days_worked?: number | null
          deleted_at?: string
          deleted_reason?: string | null
          description?: string | null
          event_name?: string | null
          expense_date: string
          expense_time?: string | null
          id?: string
          is_cash?: boolean | null
          memo_text?: string | null
          merchant?: string | null
          needs_review?: boolean | null
          original_expense_id: string
          payee_group?: string | null
          project?: string | null
          project_tag?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          staff_name?: string | null
          subcategory?: string | null
          transaction_direction?: string
          transaction_id?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          can_restore?: boolean | null
          category?: string
          category_group?: string | null
          confidence_score?: number | null
          days_worked?: number | null
          deleted_at?: string
          deleted_reason?: string | null
          description?: string | null
          event_name?: string | null
          expense_date?: string
          expense_time?: string | null
          id?: string
          is_cash?: boolean | null
          memo_text?: string | null
          merchant?: string | null
          needs_review?: boolean | null
          original_expense_id?: string
          payee_group?: string | null
          project?: string | null
          project_tag?: string | null
          receipt_url?: string | null
          receiver?: string | null
          sender?: string | null
          staff_name?: string | null
          subcategory?: string | null
          transaction_direction?: string
          transaction_id?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_groups: {
        Row: {
          created_at: string
          festival_date: string | null
          group_name: string
          id: string
          project_tag: string
          readygo_event_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          festival_date?: string | null
          group_name: string
          id?: string
          project_tag: string
          readygo_event_ids?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          festival_date?: string | null
          group_name?: string
          id?: string
          project_tag?: string
          readygo_event_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      event_notes: {
        Row: {
          created_at: string
          event_group_id: string | null
          event_id: string | null
          id: string
          is_resolved: boolean
          note_text: string
          note_type: string
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          is_resolved?: boolean
          note_text: string
          note_type?: string
          resolved_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          is_resolved?: boolean
          note_text?: string
          note_type?: string
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_notes_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_other_expenses: {
        Row: {
          amount: number
          created_at: string
          description: string
          event_group_id: string | null
          event_id: string | null
          expense_date: string | null
          id: string
          is_refundable: boolean
          refund_status: string
          refunded_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          event_group_id?: string | null
          event_id?: string | null
          expense_date?: string | null
          id?: string
          is_refundable?: boolean
          refund_status?: string
          refunded_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          event_group_id?: string | null
          event_id?: string | null
          expense_date?: string | null
          id?: string
          is_refundable?: boolean
          refund_status?: string
          refunded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_other_expenses_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_other_income: {
        Row: {
          amount: number
          created_at: string
          description: string
          event_group_id: string | null
          event_id: string | null
          id: string
          income_date: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          income_date?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          income_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_other_income_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_product_costs: {
        Row: {
          created_at: string
          event_group_id: string | null
          event_id: string | null
          id: string
          product_name: string
          quantity: number
          total_cost: number | null
          unit_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          product_name: string
          quantity?: number
          total_cost?: number | null
          unit_cost?: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_group_id?: string | null
          event_id?: string | null
          id?: string
          product_name?: string
          quantity?: number
          total_cost?: number | null
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_product_costs_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registry: {
        Row: {
          aliases: string[]
          created_at: string
          event_date: string | null
          event_name: string
          id: string
          is_active: boolean
          project_tag: string
          readygo_event_id: string | null
          user_id: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          event_date?: string | null
          event_name: string
          id?: string
          is_active?: boolean
          project_tag: string
          readygo_event_id?: string | null
          user_id: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          event_date?: string | null
          event_name?: string
          id?: string
          is_active?: boolean
          project_tag?: string
          readygo_event_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      event_reminders: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string
          event_group_id: string | null
          event_id: string | null
          gcal_event_id: string | null
          id: string
          is_completed: boolean
          line_notified_at: string | null
          notify_gcal: boolean
          notify_line: boolean
          related_expense_id: string | null
          remind_before_days: number
          reminder_type: string
          title: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          event_group_id?: string | null
          event_id?: string | null
          gcal_event_id?: string | null
          id?: string
          is_completed?: boolean
          line_notified_at?: string | null
          notify_gcal?: boolean
          notify_line?: boolean
          related_expense_id?: string | null
          remind_before_days?: number
          reminder_type?: string
          title: string
          user_id: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          event_group_id?: string | null
          event_id?: string | null
          gcal_event_id?: string | null
          id?: string
          is_completed?: boolean
          line_notified_at?: string | null
          notify_gcal?: boolean
          notify_line?: boolean
          related_expense_id?: string | null
          remind_before_days?: number
          reminder_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          category_group: string | null
          confidence_score: number | null
          created_at: string
          days_worked: number | null
          description: string | null
          event_name: string | null
          expense_date: string
          expense_time: string | null
          id: string
          is_cash: boolean
          memo_text: string | null
          merchant: string | null
          needs_review: boolean | null
          non_duplicate_pairs: string[] | null
          payee_group: string | null
          project: string | null
          project_tag: string | null
          receipt_url: string | null
          receiver: string | null
          receiver_account_name: string | null
          receiver_account_number: string | null
          receiver_bank: string | null
          sender: string | null
          sender_account_name: string | null
          sender_account_number: string | null
          sender_bank: string | null
          settled_batch_id: string | null
          staff_name: string | null
          subcategory: string | null
          transaction_direction: string
          transaction_id: string | null
          transaction_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          category: string
          category_group?: string | null
          confidence_score?: number | null
          created_at?: string
          days_worked?: number | null
          description?: string | null
          event_name?: string | null
          expense_date: string
          expense_time?: string | null
          id?: string
          is_cash?: boolean
          memo_text?: string | null
          merchant?: string | null
          needs_review?: boolean | null
          non_duplicate_pairs?: string[] | null
          payee_group?: string | null
          project?: string | null
          project_tag?: string | null
          receipt_url?: string | null
          receiver?: string | null
          receiver_account_name?: string | null
          receiver_account_number?: string | null
          receiver_bank?: string | null
          sender?: string | null
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank?: string | null
          settled_batch_id?: string | null
          staff_name?: string | null
          subcategory?: string | null
          transaction_direction?: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          category_group?: string | null
          confidence_score?: number | null
          created_at?: string
          days_worked?: number | null
          description?: string | null
          event_name?: string | null
          expense_date?: string
          expense_time?: string | null
          id?: string
          is_cash?: boolean
          memo_text?: string | null
          merchant?: string | null
          needs_review?: boolean | null
          non_duplicate_pairs?: string[] | null
          payee_group?: string | null
          project?: string | null
          project_tag?: string | null
          receipt_url?: string | null
          receiver?: string | null
          receiver_account_name?: string | null
          receiver_account_number?: string | null
          receiver_bank?: string | null
          sender?: string | null
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank?: string | null
          settled_batch_id?: string | null
          staff_name?: string | null
          subcategory?: string | null
          transaction_direction?: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_settled_batch_id_fkey"
            columns: ["settled_batch_id"]
            isOneToOne: false
            referencedRelation: "wht_remittance_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      forward_recipients: {
        Row: {
          created_at: string
          display_name: string
          forward_image: boolean
          forward_summary: boolean
          id: string
          is_active: boolean
          line_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          forward_image?: boolean
          forward_summary?: boolean
          id?: string
          is_active?: boolean
          line_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          forward_image?: boolean
          forward_summary?: boolean
          id?: string
          is_active?: boolean
          line_user_id?: string
          user_id?: string
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
          source_folder: string | null
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
          source_folder?: string | null
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
          source_folder?: string | null
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
      line_pending_billings: {
        Row: {
          amount: number | null
          created_at: string
          description: string | null
          expires_at: string
          id: string
          kind: string
          line_user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          kind: string
          line_user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          kind?: string
          line_user_id?: string
        }
        Relationships: []
      }
      line_pending_memos: {
        Row: {
          created_at: string
          id: string
          line_user_id: string
          memo_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_user_id: string
          memo_text: string
        }
        Update: {
          created_at?: string
          id?: string
          line_user_id?: string
          memo_text?: string
        }
        Relationships: []
      }
      line_user_mappings: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          line_user_id: string
          supabase_user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id: string
          supabase_user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id?: string
          supabase_user_id?: string
        }
        Relationships: []
      }
      line_user_roles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          line_user_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      payee_groups: {
        Row: {
          created_at: string
          group_name: string
          id: string
          payee_pattern: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          payee_pattern: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          payee_pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_vouchers: {
        Row: {
          created_at: string
          id: string
          paid_date: string | null
          pdf_url: string | null
          signed_url: string | null
          staff_invoice_id: string
          user_id: string
          voucher_number: string
          wht_cert_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          paid_date?: string | null
          pdf_url?: string | null
          signed_url?: string | null
          staff_invoice_id: string
          user_id: string
          voucher_number: string
          wht_cert_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          paid_date?: string | null
          pdf_url?: string | null
          signed_url?: string | null
          staff_invoice_id?: string
          user_id?: string
          voucher_number?: string
          wht_cert_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_vouchers_staff_invoice_id_fkey"
            columns: ["staff_invoice_id"]
            isOneToOne: false
            referencedRelation: "staff_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_expense_claims: {
        Row: {
          amount: number
          approver_signature_url: string | null
          category: string
          claimant_signature_url: string | null
          created_at: string
          description: string
          event_id: string | null
          event_name: string | null
          expense_date: string | null
          has_formal_receipt: boolean
          id: string
          invoice_id: string | null
          notes: string | null
          receipt_url: string | null
          reimbursed_at: string | null
          reimbursed_expense_id: string | null
          staff_id: string
          status: string
          substitute_receipt_url: string | null
          user_id: string
          vendor_invoice_id: string | null
        }
        Insert: {
          amount?: number
          approver_signature_url?: string | null
          category?: string
          claimant_signature_url?: string | null
          created_at?: string
          description: string
          event_id?: string | null
          event_name?: string | null
          expense_date?: string | null
          has_formal_receipt?: boolean
          id?: string
          invoice_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          reimbursed_expense_id?: string | null
          staff_id: string
          status?: string
          substitute_receipt_url?: string | null
          user_id: string
          vendor_invoice_id?: string | null
        }
        Update: {
          amount?: number
          approver_signature_url?: string | null
          category?: string
          claimant_signature_url?: string | null
          created_at?: string
          description?: string
          event_id?: string | null
          event_name?: string | null
          expense_date?: string | null
          has_formal_receipt?: boolean
          id?: string
          invoice_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          reimbursed_expense_id?: string | null
          staff_id?: string
          status?: string
          substitute_receipt_url?: string | null
          user_id?: string
          vendor_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_expense_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "staff_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_expense_claims_reimbursed_expense_id_fkey"
            columns: ["reimbursed_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_expense_claims_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_expense_claims_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_expense_claims_vendor_invoice_id_fkey"
            columns: ["vendor_invoice_id"]
            isOneToOne: false
            referencedRelation: "vendor_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invoice_audit_log: {
        Row: {
          action: string
          changed_by: string
          changed_by_email: string | null
          created_at: string
          id: string
          invoice_id: string
          invoice_number: string | null
          new_data: Json | null
          new_status: string | null
          old_data: Json | null
          old_status: string | null
          reason: string | null
        }
        Insert: {
          action: string
          changed_by: string
          changed_by_email?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          invoice_number?: string | null
          new_data?: Json | null
          new_status?: string | null
          old_data?: Json | null
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          changed_by?: string
          changed_by_email?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          invoice_number?: string | null
          new_data?: Json | null
          new_status?: string | null
          old_data?: Json | null
          old_status?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      staff_invoices: {
        Row: {
          bonus_amount: number
          created_at: string
          daily_rate: number
          days_worked: number
          event_id: string | null
          event_name: string | null
          gross_amount: number
          id: string
          invoice_number: string
          matched_expense_id: string | null
          net_amount: number
          notes: string | null
          paid_at: string | null
          payment_slip_url: string | null
          staff_id: string
          status: string
          submitted_at: string | null
          submitted_via: string | null
          user_id: string
          wht_amount: number
          wht_rate: number
          work_end_date: string | null
          work_start_date: string | null
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          daily_rate?: number
          days_worked?: number
          event_id?: string | null
          event_name?: string | null
          gross_amount?: number
          id?: string
          invoice_number: string
          matched_expense_id?: string | null
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          payment_slip_url?: string | null
          staff_id: string
          status?: string
          submitted_at?: string | null
          submitted_via?: string | null
          user_id: string
          wht_amount?: number
          wht_rate?: number
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          daily_rate?: number
          days_worked?: number
          event_id?: string | null
          event_name?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string
          matched_expense_id?: string | null
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          payment_slip_url?: string | null
          staff_id?: string
          status?: string
          submitted_at?: string | null
          submitted_via?: string | null
          user_id?: string
          wht_amount?: number
          wht_rate?: number
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invoices_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invoices_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string
          daily_rate: number
          email: string | null
          id: string
          id_card_url: string | null
          is_active: boolean
          line_user_id: string | null
          nickname: string | null
          phone: string | null
          position: string | null
          staff_name: string
          tax_id: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          daily_rate?: number
          email?: string | null
          id?: string
          id_card_url?: string | null
          is_active?: boolean
          line_user_id?: string | null
          nickname?: string | null
          phone?: string | null
          position?: string | null
          staff_name: string
          tax_id?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          daily_rate?: number
          email?: string | null
          id?: string
          id_card_url?: string | null
          is_active?: boolean
          line_user_id?: string | null
          nickname?: string | null
          phone?: string | null
          position?: string | null
          staff_name?: string
          tax_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_invoices: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          document_type: string
          due_date: string | null
          file_url: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_formal: boolean
          link_type: string
          linked_staff_id: string | null
          matched_expense_id: string | null
          net_amount: number
          notes: string | null
          ocr_data: Json | null
          paid_at: string | null
          payment_slip_url: string | null
          status: string
          submitted_via_line_display_name: string | null
          submitted_via_line_user_id: string | null
          tax_id: string | null
          user_id: string
          vat_amount: number
          vendor_id: string | null
          wht_amount: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          document_type?: string
          due_date?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_formal?: boolean
          link_type?: string
          linked_staff_id?: string | null
          matched_expense_id?: string | null
          net_amount?: number
          notes?: string | null
          ocr_data?: Json | null
          paid_at?: string | null
          payment_slip_url?: string | null
          status?: string
          submitted_via_line_display_name?: string | null
          submitted_via_line_user_id?: string | null
          tax_id?: string | null
          user_id: string
          vat_amount?: number
          vendor_id?: string | null
          wht_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          document_type?: string
          due_date?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_formal?: boolean
          link_type?: string
          linked_staff_id?: string | null
          matched_expense_id?: string | null
          net_amount?: number
          notes?: string | null
          ocr_data?: Json | null
          paid_at?: string | null
          payment_slip_url?: string | null
          status?: string
          submitted_via_line_display_name?: string | null
          submitted_via_line_user_id?: string | null
          tax_id?: string | null
          user_id?: string
          vat_amount?: number
          vendor_id?: string | null
          wht_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoices_linked_staff_id_fkey"
            columns: ["linked_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_linked_staff_id_fkey"
            columns: ["linked_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          line_user_id: string | null
          phone: string | null
          tax_doc_url: string | null
          tax_id: string | null
          user_id: string
          vendor_type: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          phone?: string | null
          tax_doc_url?: string | null
          tax_id?: string | null
          user_id: string
          vendor_type?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          phone?: string | null
          tax_doc_url?: string | null
          tax_id?: string | null
          user_id?: string
          vendor_type?: string
        }
        Relationships: []
      }
      wht_certificate_items: {
        Row: {
          certificate_id: string
          created_at: string
          gross_amount: number
          id: string
          income_type_index: number
          income_type_label: string
          payment_date: string | null
          tax_amount: number
          tax_rate: number
        }
        Insert: {
          certificate_id: string
          created_at?: string
          gross_amount?: number
          id?: string
          income_type_index?: number
          income_type_label: string
          payment_date?: string | null
          tax_amount?: number
          tax_rate?: number
        }
        Update: {
          certificate_id?: string
          created_at?: string
          gross_amount?: number
          id?: string
          income_type_index?: number
          income_type_label?: string
          payment_date?: string | null
          tax_amount?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "wht_certificate_items_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "wht_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      wht_certificates: {
        Row: {
          created_at: string
          doc_number: string | null
          flowaccount_url: string | null
          id: string
          issue_date: string
          payee_address: string | null
          payee_name: string
          payee_source: string | null
          payee_source_id: string | null
          payee_tax_id: string | null
          payee_type: string
          payer_address: string | null
          payer_condition: string
          payer_name: string | null
          payer_tax_id: string | null
          pnd_type: string
          sent_at: string | null
          sent_to_payee: boolean
          source_invoice_id: string | null
          source_type: string | null
          status: string
          total_gross: number
          total_tax: number
          total_tax_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_number?: string | null
          flowaccount_url?: string | null
          id?: string
          issue_date?: string
          payee_address?: string | null
          payee_name: string
          payee_source?: string | null
          payee_source_id?: string | null
          payee_tax_id?: string | null
          payee_type?: string
          payer_address?: string | null
          payer_condition?: string
          payer_name?: string | null
          payer_tax_id?: string | null
          pnd_type?: string
          sent_at?: string | null
          sent_to_payee?: boolean
          source_invoice_id?: string | null
          source_type?: string | null
          status?: string
          total_gross?: number
          total_tax?: number
          total_tax_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          doc_number?: string | null
          flowaccount_url?: string | null
          id?: string
          issue_date?: string
          payee_address?: string | null
          payee_name?: string
          payee_source?: string | null
          payee_source_id?: string | null
          payee_tax_id?: string | null
          payee_type?: string
          payer_address?: string | null
          payer_condition?: string
          payer_name?: string | null
          payer_tax_id?: string | null
          pnd_type?: string
          sent_at?: string | null
          sent_to_payee?: boolean
          source_invoice_id?: string | null
          source_type?: string | null
          status?: string
          total_gross?: number
          total_tax?: number
          total_tax_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wht_remittance_batches: {
        Row: {
          batch_month: string
          created_at: string
          filed_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_expense_id: string | null
          pnd_type: string
          status: string
          total_tax: number
          user_id: string
        }
        Insert: {
          batch_month: string
          created_at?: string
          filed_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_expense_id?: string | null
          pnd_type?: string
          status?: string
          total_tax?: number
          user_id: string
        }
        Update: {
          batch_month?: string
          created_at?: string
          filed_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_expense_id?: string | null
          pnd_type?: string
          status?: string
          total_tax?: number
          user_id?: string
        }
        Relationships: []
      }
      wht_remittance_items: {
        Row: {
          batch_id: string
          created_at: string
          flowaccount_url: string | null
          gross_amount: number
          id: string
          payee_name: string
          source_id: string
          source_type: string
          wht_amount: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          flowaccount_url?: string | null
          gross_amount?: number
          id?: string
          payee_name: string
          source_id: string
          source_type?: string
          wht_amount?: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          flowaccount_url?: string | null
          gross_amount?: number
          id?: string
          payee_name?: string
          source_id?: string
          source_type?: string
          wht_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "wht_remittance_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "wht_remittance_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      staff_profiles_public: {
        Row: {
          daily_rate: number | null
          id: string | null
          is_active: boolean | null
          nickname: string | null
          phone: string | null
          staff_name: string | null
          user_id: string | null
        }
        Insert: {
          daily_rate?: number | null
          id?: string | null
          is_active?: boolean | null
          nickname?: string | null
          phone?: string | null
          staff_name?: string | null
          user_id?: string | null
        }
        Update: {
          daily_rate?: number | null
          id?: string | null
          is_active?: boolean | null
          nickname?: string | null
          phone?: string | null
          staff_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_staff_public_info: {
        Args: { p_staff_id: string }
        Returns: {
          daily_rate: number
          id: string
          is_active: boolean
          nickname: string
          phone: string
          staff_name: string
          user_id: string
        }[]
      }
      get_wht_certificate_public: { Args: { p_cert_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_user_id: { Args: { p_user_id: string }; Returns: boolean }
      link_staff_line_id: {
        Args: {
          p_line_user_id: string
          p_owner: string
          p_phone: string
          p_staff_id?: string
        }
        Returns: Json
      }
      link_vendor_line_id: {
        Args: {
          p_line_user_id: string
          p_owner: string
          p_phone: string
          p_tax_id: string
          p_vendor_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin" | "accountant"
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
      app_role: ["admin", "user", "super_admin", "accountant"],
    },
  },
} as const
