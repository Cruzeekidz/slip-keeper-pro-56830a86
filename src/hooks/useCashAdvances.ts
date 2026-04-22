import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export type CashAdvance = {
  id: string;
  user_id: string;
  recipient_id: string | null;
  recipient_line_user_id: string | null;
  recipient_name: string;
  recipient_type: string;
  advance_date: string;
  amount: number;
  cleared_amount: number;
  status: string; // outstanding | partial | cleared | written_off
  purpose: string | null;
  event_id: string | null;
  event_name: string | null;
  project_tag: string | null;
  payment_slip_url: string | null;
  source_expense_id: string | null;
  submitted_via: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CashAdvanceClearance = {
  id: string;
  advance_id: string;
  user_id: string;
  clear_date: string;
  amount: number;
  refund_amount: number;
  description: string | null;
  receipt_url: string | null;
  substitute_receipt_url: string | null;
  has_formal_receipt: boolean;
  expense_id: string | null;
  notes: string | null;
  submitted_via: string | null;
  created_at: string;
};

export function useCashAdvances() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cash-advances", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advances")
        .select("*")
        .order("advance_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as CashAdvance[];
    },
  });
}

export function useCashAdvanceClearances(advanceId: string | null) {
  return useQuery({
    queryKey: ["cash-advance-clearances", advanceId],
    enabled: !!advanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_clearances")
        .select("*")
        .eq("advance_id", advanceId!)
        .order("clear_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CashAdvanceClearance[];
    },
  });
}

export function useCreateCashAdvance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      recipient_name: string;
      recipient_id?: string | null;
      recipient_line_user_id?: string | null;
      amount: number;
      advance_date?: string;
      purpose?: string | null;
      event_name?: string | null;
      project_tag?: string | null;
      payment_slip_url?: string | null;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("not authenticated");
      const { data, error } = await supabase
        .from("cash_advances")
        .insert({
          user_id: user.id,
          recipient_name: input.recipient_name,
          recipient_id: input.recipient_id ?? null,
          recipient_line_user_id: input.recipient_line_user_id ?? null,
          recipient_type: "staff",
          amount: input.amount,
          advance_date: input.advance_date ?? new Date().toISOString().slice(0, 10),
          purpose: input.purpose ?? null,
          event_name: input.event_name ?? null,
          project_tag: input.project_tag ?? null,
          payment_slip_url: input.payment_slip_url ?? null,
          notes: input.notes ?? null,
          submitted_via: "web",
        })
        .select()
        .single();
      if (error) throw error;
      return data as CashAdvance;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-advances"] });
      toast({ title: "บันทึกเงินทดรองสำเร็จ" });
    },
    onError: (e: any) =>
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCashAdvance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_advances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-advances"] });
      toast({ title: "ลบรายการสำเร็จ" });
    },
    onError: (e: any) =>
      toast({ title: "ลบไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });
}

export function useAddClearance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      advance_id: string;
      amount: number;
      refund_amount?: number;
      clear_date?: string;
      description?: string | null;
      receipt_url?: string | null;
      substitute_receipt_url?: string | null;
      has_formal_receipt?: boolean;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("not authenticated");
      const { data, error } = await supabase
        .from("cash_advance_clearances")
        .insert({
          advance_id: input.advance_id,
          user_id: user.id,
          amount: input.amount,
          refund_amount: input.refund_amount ?? 0,
          clear_date: input.clear_date ?? new Date().toISOString().slice(0, 10),
          description: input.description ?? null,
          receipt_url: input.receipt_url ?? null,
          substitute_receipt_url: input.substitute_receipt_url ?? null,
          has_formal_receipt: input.has_formal_receipt ?? false,
          notes: input.notes ?? null,
          submitted_via: "web",
        })
        .select()
        .single();
      if (error) throw error;
      return data as CashAdvanceClearance;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cash-advances"] });
      qc.invalidateQueries({ queryKey: ["cash-advance-clearances", vars.advance_id] });
      toast({ title: "บันทึกการเคลียร์สำเร็จ" });
    },
    onError: (e: any) =>
      toast({ title: "บันทึกไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteClearance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id }: { id: string; advance_id: string }) => {
      const { error } = await supabase.from("cash_advance_clearances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cash-advances"] });
      qc.invalidateQueries({ queryKey: ["cash-advance-clearances", vars.advance_id] });
      toast({ title: "ลบรายการเคลียร์สำเร็จ" });
    },
    onError: (e: any) =>
      toast({ title: "ลบไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });
}

export function useWriteOffAdvance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from("cash_advances")
        .update({ status: "written_off", notes: notes ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-advances"] });
      toast({ title: "ตัดยอดเป็นค่าใช้จ่ายแล้ว" });
    },
    onError: (e: any) =>
      toast({ title: "ไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });
}

export function summariseByPerson(advances: CashAdvance[]) {
  const map = new Map<string, { name: string; total: number; outstanding: number; count: number }>();
  for (const a of advances) {
    const key = a.recipient_id || a.recipient_name;
    const cur = map.get(key) || { name: a.recipient_name, total: 0, outstanding: 0, count: 0 };
    cur.total += Number(a.amount);
    if (a.status !== "cleared" && a.status !== "written_off") {
      cur.outstanding += Math.max(0, Number(a.amount) - Number(a.cleared_amount));
    }
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
}
