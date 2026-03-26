import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useCallback } from "react";

export interface VendorProfile {
  id: string;
  vendor_type: string;
  company_name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account: string | null;
  tax_doc_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VendorInvoice {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  vat_amount: number;
  wht_amount: number;
  net_amount: number;
  description: string | null;
  file_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const VENDORS_KEY = ["vendor-profiles"] as const;
const INVOICES_KEY = ["vendor-invoices"] as const;

export function useVendorProfiles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: VENDORS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorProfile[];
    },
    enabled: !!user,
  });
}

export function useVendorInvoices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: INVOICES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorInvoice[];
    },
    enabled: !!user,
  });
}

export function useVendorSummaries(vendors: VendorProfile[], invoices: VendorInvoice[]) {
  return useMemo(() => {
    return vendors.map((v) => {
      const vInvoices = invoices.filter((inv) => inv.vendor_id === v.id);
      const pending = vInvoices.filter((i) => i.status === "pending");
      const approved = vInvoices.filter((i) => i.status === "approved");
      const paid = vInvoices.filter((i) => i.status === "paid");
      const totalOutstanding = [...pending, ...approved].reduce((s, i) => s + i.net_amount, 0);
      const totalPaid = paid.reduce((s, i) => s + i.net_amount, 0);
      return {
        vendor: v,
        invoiceCount: vInvoices.length,
        pendingCount: pending.length,
        approvedCount: approved.length,
        paidCount: paid.length,
        totalOutstanding,
        totalPaid,
      };
    });
  }, [vendors, invoices]);
}

export function useUpdateInvoiceStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "paid") updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from("vendor_invoices").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      const statusMap: Record<string, string> = { pending: "รอตรวจสอบ", approved: "อนุมัติแล้ว", paid: "จ่ายแล้ว" };
      toast({ title: `อัปเดตสถานะเป็น "${statusMap[status]}" แล้ว` });
    },
    onError: () => {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });
}

export function useLinkInvoiceToVendor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, vendorId }: { invoiceId: string; vendorId: string }) => {
      const { error } = await supabase.from("vendor_invoices").update({ vendor_id: vendorId }).eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      toast({ title: "เชื่อมคู่ค้าสำเร็จ" });
    },
  });
}

export function useDeleteVendor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDORS_KEY });
      toast({ title: "ลบคู่ค้าแล้ว" });
    },
  });
}

export function useDeleteInvoice() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      toast({ title: "ลบบิลแล้ว" });
    },
  });
}

export function useAutoLinkInvoices(vendors: VendorProfile[], invoices: VendorInvoice[]) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!user || vendors.length === 0) return;
    const unlinked = invoices.filter((inv) => !inv.vendor_id && inv.description);
    if (unlinked.length === 0) {
      toast({ title: "ไม่มีบิลที่ต้องเชื่อม", description: "บิลทั้งหมดเชื่อมกับคู่ค้าแล้ว" });
      return;
    }

    let linked = 0;
    for (const inv of unlinked) {
      const desc = (inv.description || "").toLowerCase();
      const match = vendors.find((v) =>
        desc.includes(v.company_name.toLowerCase()) ||
        (v.tax_id && desc.includes(v.tax_id))
      );
      if (match) {
        const { error } = await supabase
          .from("vendor_invoices")
          .update({ vendor_id: match.id })
          .eq("id", inv.id);
        if (!error) linked++;
      }
    }

    toast({
      title: `เชื่อมบิลอัตโนมัติสำเร็จ`,
      description: `เชื่อมได้ ${linked} จาก ${unlinked.length} รายการ`,
    });
    if (linked > 0) queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
  }, [invoices, vendors, user, toast, queryClient]);
}
