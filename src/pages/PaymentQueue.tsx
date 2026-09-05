import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Copy, Check, Banknote, Upload, ImageIcon, CreditCard, Building2, Receipt, CheckCircle2, XCircle, FileText, Pencil, Send, Search, ExternalLink, CalendarClock, Plus } from "lucide-react";
import AdminVendorBillSheet from "@/components/payment/AdminVendorBillSheet";
import VendorBillPaySheet from "@/components/payment/VendorBillPaySheet";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buildUploadPath } from "@/lib/storage-path";

interface PaymentItem {
  id: string;
  staff_id: string;
  invoice_number: string;
  event_name: string | null;
  event_id: string | null;
  days_worked: number;
  daily_rate: number;
  gross_amount: number;
  bonus_amount: number;
  wht_rate: number;
  wht_amount: number;
  net_amount: number;
  status: string;
  payment_slip_url: string | null;
  matched_expense_id: string | null;
  created_at: string;
  staff_profiles: {
    staff_name: string;
    nickname: string | null;
    bank_name: string | null;
    bank_account: string | null;
    tax_id: string | null;
  } | null;
}

const cleanAccountNumber = (account: string | null | undefined): string => {
  if (!account) return "";
  return account.replace(/[-\s]/g, "");
};

// FlowAccount deep-links (production UI). User has real account here.
const FA_BASE = "https://app.flowaccount.com";
const FA_LINKS = {
  createExpense: `${FA_BASE}/#/expense-notes/create`,
  uploadBill: `${FA_BASE}/#/purchase-tax-invoices/create`,
  createWht: `${FA_BASE}/#/withholding-taxes/create`,
};

const formatSubmittedAt = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, "0");
    const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    const m = months[d.getMonth()];
    const y = d.getFullYear() + 543;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${m} ${y} · ${hh}:${mm}`;
  } catch { return ""; }
};

const PaymentQueue = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payDialog, setPayDialog] = useState<PaymentItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rejectClaim, setRejectClaim] = useState<{ id: string; staff_name: string; amount: number } | null>(null);
  const [revertClaim, setRevertClaim] = useState<{ id: string; staff_name: string; amount: number } | null>(null);
  const [rejectInvoice, setRejectInvoice] = useState<{ id: string; staff_name: string; amount: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "staff" | "claim" | "vendor">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");
  const [search, setSearch] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [adminBillOpen, setAdminBillOpen] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [selectedStaffInvoiceIds, setSelectedStaffInvoiceIds] = useState<string[]>([]);
  const [paySheetBill, setPaySheetBill] = useState<any | null>(null);
  const [vendorPayDialog, setVendorPayDialog] = useState<any | null>(null);
  const vendorFileInputRef = useRef<HTMLInputElement>(null);

  const { data: pendingInvoices = [], isLoading } = useQuery({
    queryKey: ["payment-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoices")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account, tax_id)")
        .in("status", ["submitted", "approved"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as PaymentItem[];
    },
    enabled: !!user,
  });

  const { data: pendingClaims = [] } = useQuery({
    queryKey: ["payment-queue-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_expense_claims")
        .select("id, staff_id, amount, description, category, expense_date, event_name, receipt_url, status, created_at, staff_profiles(staff_name, nickname)")
        .in("status", ["submitted", "approved"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const { data: pendingVendorBills = [] } = useQuery({
    queryKey: ["payment-queue-vendor-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, receipt_no, invoice_number, description, amount, vat_amount, net_amount, wht_amount, wht_rate, voucher_id, matched_expense_id, tax_id, file_url, status, vendor_id, link_type, invoice_date, due_date, created_at, source, line_raw_text, submitted_via_line_user_id, submitted_via_line_display_name, flowaccount_bill_id, flowaccount_bill_url, flowaccount_wht_id, flowaccount_wht_url, flowaccount_expense_id, flowaccount_expense_url, flowaccount_push_status, flowaccount_push_error, flowaccount_pushed_at, vendor_profiles(company_name, bank_name, bank_account, tax_id, address, line_user_id)")
        .in("status", ["pending", "approved"])
        .neq("link_type", "staff")
        .order("invoice_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const vendorBillActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "paid" | "reject" }) => {
      const newStatus = action === "approve" ? "approved" : action === "paid" ? "paid" : "rejected";
      const updates: any = { status: newStatus };
      if (action === "paid") updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from("vendor_invoices").update(updates).eq("id", id);
      if (error) throw error;
      // ยังไม่เชื่อม FlowAccount API — ใช้ลิงก์เปิดเอกสารบน FA เอง
      return { action };
    },
    onSuccess: (result: any) => {
      const action = result?.action;
      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      toast({
        title: action === "paid" ? "✅ บันทึกว่าจ่ายแล้ว" : action === "approve" ? "✅ อนุมัติบิลแล้ว" : "ปฏิเสธบิลแล้ว",
      });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  /**
   * จ่ายบิลคู่ค้า + แนบสลิปโอน (แบบเดียวกับการจ่ายทีมงาน)
   * - อัปโหลดสลิปเก็บตามปี/เดือน
   * - ถ้าบิลอยู่ในใบสรุปการจ่าย (P####) จะตัดจ่ายทุกบิล/ใบทีมงานในชุดเดียวกัน
   * - สร้างรายการค่าใช้จ่าย (ยอดรวม VAT) ให้อัตโนมัติ ถ้ายังไม่มีรายการผูกไว้
   */
  const markVendorBillPaidMutation = useMutation({
    mutationFn: async ({ bill, slipFile }: { bill: any; slipFile: File }) => {
      if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const ext = slipFile.name.split(".").pop() || "jpg";
      const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_${bill.id}.${ext}`);
      const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, slipFile, {
        contentType: slipFile.type,
      });
      if (uploadErr) throw uploadErr;

      const paidAt = new Date().toISOString();
      const today = paidAt.split("T")[0];

      // รวบรวมบิลที่ต้องตัดจ่าย
      let bills: any[] = [bill];
      if (bill.voucher_id) {
        const { data: groupBills } = await supabase
          .from("vendor_invoices")
          .select("id, receipt_no, invoice_number, description, amount, vat_amount, wht_amount, wht_rate, net_amount, matched_expense_id, vendor_id, vendor_profiles(company_name)")
          .eq("voucher_id", bill.voucher_id);
        if (groupBills?.length) bills = groupBills as any[];
      }

      for (const b of bills) {
        let expenseId: string | null = b.matched_expense_id ?? null;

        if (!expenseId) {
          const base = Number(b.amount) || 0;
          const vat = Number(b.vat_amount) || 0;
          const wht = Number(b.wht_amount) || 0;
          const vendorName = (b as any).vendor_profiles?.company_name || bill.vendor_profiles?.company_name || bill.submitted_via_line_display_name || null;
          const { data: newExpense, error: expErr } = await supabase
            .from("expenses")
            .insert({
              user_id: user.id,
              amount: base + vat,
              vat_amount: vat,
              vat_rate: vat > 0 && base > 0 ? 7 : 0,
              wht_amount: wht,
              wht_rate: Number(b.wht_rate) || 0,
              category: "ธุรกิจ",
              subcategory: "Vendor",
              description: `จ่ายบิลคู่ค้า - ${vendorName || "ไม่ระบุคู่ค้า"} ${b.description || ""}`.trim(),
              expense_date: today,
              transaction_direction: "EXPENSE",
              transaction_type: "BUSINESS",
              receiver: vendorName,
              is_cash: false,
              receipt_url: path,
              memo_text: `${b.receipt_no || b.invoice_number || ""} — ยอดรวม ${(base + vat).toLocaleString()} / โอน ${Number(b.net_amount || base + vat - wht).toLocaleString()}`.trim(),
            } as any)
            .select("id")
            .single();
          if (expErr) throw expErr;
          expenseId = newExpense?.id ?? null;
        }

        const { error: updErr } = await supabase
          .from("vendor_invoices")
          .update({
            status: "paid",
            paid_at: paidAt,
            payment_slip_url: path,
            matched_expense_id: expenseId,
          } as any)
          .eq("id", b.id);
        if (updErr) throw updErr;
      }

      // ใบทีมงานที่อยู่ในใบสรุปเดียวกัน + ตัวใบสรุปเอง
      if (bill.voucher_id) {
        await supabase
          .from("staff_invoices")
          .update({ status: "paid", paid_at: paidAt, payment_slip_url: path } as any)
          .eq("voucher_id", bill.voucher_id)
          .neq("status", "paid");
        await supabase
          .from("payment_vouchers")
          .update({ status: "paid", paid_date: today, payment_slip_url: path } as any)
          .eq("id", bill.voucher_id);
      }

      return { count: bills.length };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setVendorPayDialog(null);
      toast({ title: `✅ บันทึกการจ่าย + แนบสลิปแล้ว (${res?.count || 1} รายการ)` });
    },
    onError: (err: any) => toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  // รวมหลายบิลเป็นใบสรุปการจ่าย (P00xx) — ใช้ตัดจ่ายทีเดียวด้วย @P00xx
  const createVoucherMutation = useMutation({
    mutationFn: async ({ bills, staffInvoices }: { bills: any[]; staffInvoices: any[] }) => {
      if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      if (!bills.length && !staffInvoices.length) throw new Error("ยังไม่ได้เลือกรายการ");
      const vendorIds = new Set(bills.map((b) => b.vendor_id).filter(Boolean));
      const { data: no, error: noErr } = await supabase.rpc("next_payment_voucher_no" as any);
      if (noErr) throw noErr;
      const billTotal = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const billWht = bills.reduce((s, b) => s + (Number(b.wht_amount) || 0), 0);
      const staffTotal = staffInvoices.reduce((s, i) => s + (Number(i.gross_amount) || 0), 0);
      const staffWht = staffInvoices.reduce((s, i) => s + (Number(i.wht_amount) || 0), 0);
      const total = billTotal + staffTotal;
      const wht = billWht + staffWht;
      const { data: voucher, error } = await supabase
        .from("payment_vouchers")
        .insert({
          user_id: user.id,
          voucher_number: no as unknown as string,
          vendor_id: !staffInvoices.length && vendorIds.size === 1 ? [...vendorIds][0] : null,
          staff_invoice_id: staffInvoices.length === 1 && !bills.length ? staffInvoices[0].id : null,
          total_amount: total,
          total_wht: wht,
          total_net: total - wht,
          status: "open",
        } as any)
        .select("id, voucher_number")
        .single();
      if (error) throw error;
      if (bills.length) {
        const { error: linkErr } = await supabase
          .from("vendor_invoices")
          .update({ voucher_id: voucher.id, status: "approved" } as any)
          .in("id", bills.map((b) => b.id));
        if (linkErr) throw linkErr;
      }
      if (staffInvoices.length) {
        const { error: sErr } = await supabase
          .from("staff_invoices")
          .update({ voucher_id: voucher.id, status: "approved" } as any)
          .in("id", staffInvoices.map((i) => i.id));
        if (sErr) throw sErr;
      }
      return voucher;
    },
    onSuccess: (voucher: any) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      setSelectedBillIds([]);
      setSelectedStaffInvoiceIds([]);
      toast({
        title: `✅ สร้างใบสรุปการจ่าย ${voucher.voucher_number}`,
        description: `ใส่ ${"@" + voucher.voucher_number} ในช่องบันทึกช่วยจำของสลิป แล้วระบบจะตัดจ่ายทุกรายการในใบนี้ให้เอง`,
      });
    },
    onError: (err: any) => toast({ title: "สร้างใบสรุปไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const openVendorBillFile = async (path: string | null) => {
    if (!path) return;
    // Open blank window synchronously to preserve user gesture (avoid popup blocker)
    const win = window.open("about:blank", "_blank");
    let signed = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) {
      signed = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    }
    if (signed.data?.signedUrl) {
      if (win) win.location.href = signed.data.signedUrl;
      else window.location.href = signed.data.signedUrl;
    } else {
      if (win) win.close();
      toast({ title: "เปิดไฟล์ไม่ได้", variant: "destructive" });
    }
  };

  const claimActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" | "revert" }) => {
      const newStatus = action === "approve" ? "approved" : action === "revert" ? "submitted" : "rejected";
      const { error } = await supabase.from("staff_expense_claims").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue-claims"] });
      queryClient.invalidateQueries({ queryKey: ["staff-reimbursement-claims"] });
      setRejectClaim(null);
      setRevertClaim(null);
      toast({ title: action === "approve" ? "อนุมัติใบเบิกแล้ว" : action === "revert" ? "ย้อนสถานะเป็นรออนุมัติแล้ว" : "ปฏิเสธใบเบิกแล้ว" });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const invoiceActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error } = await supabase.from("staff_invoices").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setRejectInvoice(null);
      toast({ title: action === "approve" ? "อนุมัติใบเรียกเก็บแล้ว" : "ปฏิเสธใบเรียกเก็บแล้ว" });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const openClaimReceipt = async (path: string | null) => {
    if (!path) return;
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const markPaidMutation = useMutation({
    mutationFn: async ({ invoiceId, slipFile }: { invoiceId: string; slipFile: File }) => {
      if (!user) throw new Error("Not authenticated");

      const ext = slipFile.name.split(".").pop() || "jpg";
      const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_${invoiceId}.${ext}`);
      const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, slipFile, {
        contentType: slipFile.type,
      });
      if (uploadErr) throw uploadErr;

      // Find the invoice to check WHT and amounts
      const inv = pendingInvoices.find((i) => i.id === invoiceId);

      const { error } = await supabase.from("staff_invoices").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_slip_url: path,
      } as any).eq("id", invoiceId);
      if (error) throw error;

      if (inv) {
        const grossAmount = Number(inv.gross_amount);
        const whtAmount = Number(inv.wht_amount);
        const today = new Date().toISOString().split("T")[0];

        // Resolve project_tag from event_registry
        let projectTag: string | null = null;
        if (inv.event_id) {
          const { data: evReg } = await supabase
            .from("event_registry")
            .select("project_tag")
            .eq("id", inv.event_id)
            .maybeSingle();
          if (evReg) projectTag = evReg.project_tag;
        }
        // Derive entity bucket from tag prefix (BCC Next / Kukanang / Program / Event)
        const wageGroup = projectTag?.startsWith("BCCNEXT-") ? "ENTITY_BCC_NEXT"
          : projectTag?.startsWith("KUKAN-") ? "ENTITY_KUKANANG"
          : projectTag?.startsWith("PROG-") ? "PROGRAM"
          : "EVENT";

        // 1. Record Gross as expense (ค่าแรงทีมงาน - ต้นทุนงาน)
        await supabase.from("expenses").insert({
          user_id: user.id,
          amount: grossAmount,
          category: "ธุรกิจ",
          subcategory: "Staff",
          description: `ค่าแรง - ${inv.staff_profiles?.staff_name || ""} ${inv.event_name || ""}`.trim(),
          expense_date: today,
          transaction_direction: "EXPENSE",
          transaction_type: "BUSINESS",
          category_group: wageGroup,
          project_tag: projectTag,
          staff_name: inv.staff_profiles?.staff_name || null,
          event_name: inv.event_name || null,
          receiver: inv.staff_profiles?.staff_name || null,
          receipt_url: path,
          memo_text: `${inv.invoice_number} — Gross ${grossAmount.toLocaleString()} / Net ${Number(inv.net_amount).toLocaleString()}`,
        });

        // 2. Record WHT as liability (ภาษีค้างจ่าย - รอนำส่งสรรพากร)
        if (whtAmount > 0) {
          await supabase.from("expenses").insert({
            user_id: user.id,
            amount: whtAmount,
            category: "ภาษีหัก ณ ที่จ่าย",
            subcategory: "Staff",
            description: `ภาษีหัก ณ ที่จ่าย ${Number(inv.wht_rate)}% - ${inv.staff_profiles?.staff_name || ""} ${inv.event_name || ""}`.trim(),
            expense_date: today,
            transaction_direction: "EXPENSE",
            transaction_type: "BUSINESS",
            category_group: wageGroup,
            project_tag: projectTag,
            staff_name: inv.staff_profiles?.staff_name || null,
            event_name: inv.event_name || null,
            receiver: "สรรพากร",
            memo_text: `รอนำส่งสิ้นเดือน - ${inv.invoice_number}`,
          });
        }

        // 3. Send slip to staff via LINE
        try {
          const staffId = (pendingInvoices.find(i => i.id === invoiceId))?.staff_id;
          if (staffId) {
            await supabase.functions.invoke("notify-staff-payment", {
              body: {
                staff_id: staffId,
                amount: Number(inv.net_amount),
                payment_slip_path: path,
              },
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify staff:", notifyErr);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setPayDialog(null);
      toast({ title: "บันทึกการจ่ายเงินสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const copyAccount = (id: string, account: string) => {
    const clean = cleanAccountNumber(account);
    navigator.clipboard.writeText(clean);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "คัดลอกเลขบัญชีแล้ว", description: clean });
  };

  const sendInfoToAccounting = async (key: string, message: string) => {
    setSending(key);
    try {
      const { data, error } = await supabase.functions.invoke("send-payment-info-line", {
        body: { message },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const sent = (data as any)?.sent ?? 0;
      const total = (data as any)?.total ?? 0;
      toast({
        title: sent > 0 ? `ส่งให้ฝ่ายบัญชีแล้ว (${sent}/${total})` : "ส่งไม่สำเร็จ",
        description: sent === 0 ? "โปรดตรวจสอบ Forward Recipients" : undefined,
        variant: sent === 0 ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "ส่งไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const matchesSearch = (text: string) => {
    if (!search.trim()) return true;
    return text.toLowerCase().includes(search.trim().toLowerCase());
  };
  const matchesDueRange = (dateStr: string | null | undefined) => {
    if (!dueFrom && !dueTo) return true;
    if (!dateStr) return false;
    if (dueFrom && dateStr < dueFrom) return false;
    if (dueTo && dateStr > dueTo) return false;
    return true;
  };

  const filteredInvoices = pendingInvoices.filter((inv) => {
    if (typeFilter !== "all" && typeFilter !== "staff") return false;
    if (statusFilter === "pending" && inv.status !== "submitted") return false;
    if (statusFilter === "approved" && inv.status !== "approved") return false;
    if (!matchesSearch(`${inv.staff_profiles?.staff_name ?? ""} ${inv.staff_profiles?.nickname ?? ""} ${inv.invoice_number} ${inv.event_name ?? ""}`)) return false;
    return matchesDueRange(null) || (!dueFrom && !dueTo);
  });
  const filteredClaims = pendingClaims.filter((c: any) => {
    if (typeFilter !== "all" && typeFilter !== "claim") return false;
    if (statusFilter === "pending" && c.status !== "submitted") return false;
    if (statusFilter === "approved" && c.status !== "approved") return false;
    if (!matchesSearch(`${c.staff_profiles?.staff_name ?? ""} ${c.description ?? ""} ${c.event_name ?? ""}`)) return false;
    return matchesDueRange(c.expense_date);
  });
  const filteredVendorBills = pendingVendorBills.filter((b: any) => {
    if (typeFilter !== "all" && typeFilter !== "vendor") return false;
    if (statusFilter === "pending" && b.status !== "pending") return false;
    if (statusFilter === "approved" && b.status !== "approved") return false;
    if (!matchesSearch(`${b.vendor_profiles?.company_name ?? ""} ${b.invoice_number ?? ""} ${b.description ?? ""}`)) return false;
    return matchesDueRange(b.due_date || b.invoice_date);
  });

  const totals = pendingInvoices.reduce(
    (acc, inv) => ({
      gross: acc.gross + Number(inv.gross_amount),
      wht: acc.wht + Number(inv.wht_amount),
      net: acc.net + Number(inv.net_amount),
    }),
    { gross: 0, wht: 0, net: 0 }
  );

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payDialog) return;
    setUploading(true);
    markPaidMutation.mutate(
      { invoiceId: payDialog.id, slipFile: file },
      { onSettled: () => setUploading(false) }
    );
  };

  const handleVendorFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendorPayDialog) return;
    setUploading(true);
    markVendorBillPaidMutation.mutate(
      { bill: vendorPayDialog, slipFile: file },
      { onSettled: () => setUploading(false) }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Banknote className="h-6 w-6" />
          <h1 className="text-xl font-bold">รายการรอจ่ายเงิน</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => navigate("/staff-payments")} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <CreditCard className="h-4 w-4 mr-1" />จ่ายเงิน
            </Button>
            <Button onClick={() => navigate("/vendor-management")} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Building2 className="h-4 w-4 mr-1" />คู่ค้า
            </Button>
            <Button onClick={() => setAdminBillOpen(true)} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />สร้างบิล
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Summary */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">สรุปรวม</p>
              <Badge variant="secondary">{pendingInvoices.length + pendingClaims.length + pendingVendorBills.length} รายการ</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">บันทึกค่าใช้จ่าย (Gross)</p>
                <p className="text-sm font-bold">{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3">
                <p className="text-xs text-destructive">หัก ณ ที่จ่าย 3%</p>
                <p className="text-sm font-bold text-destructive">{totals.wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-xs text-primary">ยอดโอนจริง (Net)</p>
                <p className="text-sm font-bold text-primary">{totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter bar */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
                <TabsTrigger value="staff">ทีมงาน</TabsTrigger>
                <TabsTrigger value="claim">เบิกคืน</TabsTrigger>
                <TabsTrigger value="vendor">คู่ค้า</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="all">ทุกสถานะ</TabsTrigger>
                <TabsTrigger value="pending">รออนุมัติ</TabsTrigger>
                <TabsTrigger value="approved">อนุมัติแล้ว · รอจ่าย</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหา ชื่อ / เลขบิล / อีเวนท์"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">ครบกำหนด ตั้งแต่</label>
                <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ถึง</label>
                <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
              </div>
            </div>
            {(search || dueFrom || dueTo || typeFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDueFrom(""); setDueTo(""); setTypeFilter("all"); setStatusFilter("all"); }}>
                ล้างตัวกรอง
              </Button>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
        ) : filteredInvoices.length === 0 && (typeFilter === "staff" || typeFilter === "all") ? (
          typeFilter === "staff" ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">ไม่มีรายการรอจ่ายเงิน</p>
              </CardContent>
            </Card>
          ) : null
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((inv) => {
              const grossAmount = Number(inv.gross_amount);
              const whtAmount = Number(inv.wht_amount);
              const netAmount = Number(inv.net_amount);
              const cleanAcct = cleanAccountNumber(inv.staff_profiles?.bank_account);

              return (
                <Card key={inv.id}>
                  <CardContent className="pt-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-primary shrink-0"
                          checked={selectedStaffInvoiceIds.includes(inv.id)}
                          onChange={(e) => setSelectedStaffInvoiceIds((prev) =>
                            e.target.checked ? [...prev, inv.id] : prev.filter((x) => x !== inv.id)
                          )}
                          aria-label="เลือกค่าจ้างนี้เพื่อรวมเป็นใบสรุปการจ่าย"
                        />
                        <div className="min-w-0">
                        <p className="font-medium">
                          {inv.staff_profiles?.staff_name}
                          {inv.staff_profiles?.nickname && (
                            <span className="text-muted-foreground font-normal text-sm ml-1">({inv.staff_profiles.nickname})</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {inv.event_name || "ไม่ระบุอีเวนท์"} • {inv.invoice_number}
                        </p>
                        {inv.created_at && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CalendarClock className="h-3 w-3" />ส่งเข้าเมื่อ {formatSubmittedAt(inv.created_at)}
                          </p>
                        )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {inv.matched_expense_id && (
                          <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                            จับคู่อัตโนมัติ
                          </Badge>
                        )}
                        <Badge variant={inv.status === "approved" ? "default" : "secondary"}>
                          {inv.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                        </Badge>
                      </div>
                    </div>

                    {/* Bank account with copy */}
                    {inv.staff_profiles?.bank_name && cleanAcct && (
                      <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{inv.staff_profiles.bank_name}</p>
                          <p className="font-mono text-lg font-bold tracking-wider">{cleanAcct}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyAccount(inv.id, inv.staff_profiles?.bank_account || "")}
                        >
                          {copiedId === inv.id ? (
                            <><Check className="h-4 w-4 mr-1 text-green-500" />คัดลอกแล้ว</>
                          ) : (
                            <><Copy className="h-4 w-4 mr-1" />คัดลอก</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Amount breakdown */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{inv.days_worked} วัน × {Number(inv.daily_rate).toLocaleString()}</span>
                        <span>{(Number(inv.days_worked) * Number(inv.daily_rate)).toLocaleString()}</span>
                      </div>
                      {Number(inv.bonus_amount || 0) > 0 && (
                        <div className="flex justify-between text-primary">
                          <span>โบนัส</span>
                          <span>+{Number(inv.bonus_amount).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Gross / WHT / Net breakdown from invoice data */}
                    <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">บันทึกค่าใช้จ่าย (Gross)</span>
                        <span className="font-medium">{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {whtAmount > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>หัก ณ ที่จ่าย {Number(inv.wht_rate)}%</span>
                          <span>-{whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="font-bold">ยอดโอนจริง (Net)</span>
                        <span className="font-bold text-primary">
                          {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          navigator.clipboard.writeText(netAmount.toFixed(2));
                          toast({ title: "คัดลอกยอดโอน", description: `${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท` });
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />คัดลอกยอดโอน
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setPayDialog(inv)}
                      >
                        <Upload className="h-4 w-4 mr-1" />จ่ายแล้ว + แนบสลิป
                      </Button>
                    </div>
                    {inv.staff_profiles?.bank_name && cleanAcct && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        disabled={sending === `inv-${inv.id}`}
                        onClick={() => sendInfoToAccounting(
                          `inv-${inv.id}`,
                          `💰 ขอโอนเงินค่าแรงทีมงาน\n\n👤 ${inv.staff_profiles?.staff_name}${inv.staff_profiles?.nickname ? ` (${inv.staff_profiles.nickname})` : ""}\n📋 ${inv.invoice_number}${inv.event_name ? `\n🎪 ${inv.event_name}` : ""}\n💵 ยอดโอน: ${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท\n\n🏦 ${inv.staff_profiles?.bank_name}\nเลขบัญชี: ${cleanAcct}\nชื่อบัญชี: ${inv.staff_profiles?.staff_name}`
                        )}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        {sending === `inv-${inv.id}` ? "กำลังส่ง..." : "ส่งข้อมูลโอนให้บัญชี"}
                      </Button>
                    )}
                    <div className="flex gap-2">
                      {inv.status === "submitted" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => invoiceActionMutation.mutate({ id: inv.id, action: "approve" })}
                          disabled={invoiceActionMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />อนุมัติ
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/staff-payments?edit=${inv.id}`)}
                        title="แก้ไขใบเรียกเก็บ"
                      >
                        <Pencil className="h-4 w-4 mr-1" />แก้ไข
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          setRejectInvoice({
                            id: inv.id,
                            staff_name: inv.staff_profiles?.staff_name || "",
                            amount: netAmount,
                          })
                        }
                      >
                        <XCircle className="h-4 w-4 mr-1" />ปฏิเสธ
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Staff expense reimbursement claims */}
        {(typeFilter === "all" || typeFilter === "claim") && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-500" />
                ใบเบิกค่าใช้จ่ายทีมงาน
              </p>
              <Badge variant="secondary">{filteredClaims.length} รายการ</Badge>
            </div>
            {filteredClaims.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">ไม่มีใบเบิกค้างอยู่</p>
            ) : (
              <div className="space-y-2">
                {filteredClaims.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.staff_profiles?.staff_name}</span>
                        {c.staff_profiles?.nickname && (
                          <span className="text-xs text-muted-foreground">({c.staff_profiles.nickname})</span>
                        )}
                        <Badge variant={c.status === "approved" ? "default" : "secondary"} className="text-[10px]">
                          {c.status === "approved" ? "อนุมัติแล้ว · รอจ่ายคืน" : "รออนุมัติ"}
                        </Badge>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{c.category}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{c.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="font-semibold text-foreground">{Number(c.amount).toLocaleString()} ฿</span>
                        {c.expense_date && <span>· {c.expense_date}</span>}
                        {c.event_name && <span>· {c.event_name}</span>}
                      </div>
                      {c.created_at && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CalendarClock className="h-3 w-3" />ส่งเข้าเมื่อ {formatSubmittedAt(c.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {c.receipt_url && (
                        <Button size="icon" variant="ghost" onClick={() => openClaimReceipt(c.receipt_url)} title="ดูใบเสร็จ">
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {c.status === "submitted" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => claimActionMutation.mutate({ id: c.id, action: "approve" })}
                            disabled={claimActionMutation.isPending}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />อนุมัติ
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRejectClaim({ id: c.id, staff_name: c.staff_profiles?.staff_name || "", amount: Number(c.amount) })}
                          >
                            <XCircle className="h-3 w-3 mr-1" />ปฏิเสธ
                          </Button>
                        </>
                      )}
                      {c.status === "approved" && (
                        <>
                          <Button size="sm" onClick={() => navigate("/staff-payments?tab=reimbursement")}>
                            <Banknote className="h-3 w-3 mr-1" />จ่ายคืน
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRevertClaim({ id: c.id, staff_name: c.staff_profiles?.staff_name || "", amount: Number(c.amount) })}
                            disabled={claimActionMutation.isPending}
                            title="ย้อนสถานะเป็นรออนุมัติ"
                          >
                            ย้อน
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRejectClaim({ id: c.id, staff_name: c.staff_profiles?.staff_name || "", amount: Number(c.amount) })}
                            title="ยกเลิก/ปฏิเสธใบเบิก"
                          >
                            <XCircle className="h-3 w-3 mr-1" />ยกเลิก
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Vendor invoices / bills */}
        {(typeFilter === "all" || typeFilter === "vendor") && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                บิลคู่ค้า / ใบแจ้งหนี้รอจ่าย
              </p>
              <Badge variant="secondary">{filteredVendorBills.length} รายการ</Badge>
            </div>
            {(selectedBillIds.length > 0 || selectedStaffInvoiceIds.length > 0) && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs">
                  เลือกไว้ {selectedBillIds.length} บิลคู่ค้า + {selectedStaffInvoiceIds.length} ค่าจ้างทีมงาน · สุทธิ{" "}
                  <span className="font-bold">
                    {(filteredVendorBills
                      .filter((b: any) => selectedBillIds.includes(b.id))
                      .reduce((s: number, b: any) => s + (Number(b.net_amount || b.amount) || 0), 0)
                      + pendingInvoices
                        .filter((i: any) => selectedStaffInvoiceIds.includes(i.id))
                        .reduce((s: number, i: any) => s + (Number(i.net_amount) || 0), 0))
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedBillIds([]); setSelectedStaffInvoiceIds([]); }}>ล้าง</Button>
                  <Button
                    size="sm"
                    disabled={createVoucherMutation.isPending}
                    onClick={() => createVoucherMutation.mutate({
                      bills: filteredVendorBills.filter((b: any) => selectedBillIds.includes(b.id)),
                      staffInvoices: pendingInvoices.filter((i: any) => selectedStaffInvoiceIds.includes(i.id)),
                    })}
                  >
                    <Receipt className="h-4 w-4 mr-1" />รวมเป็นใบสรุปการจ่าย (P)
                  </Button>
                </div>
              </div>
            )}
            {filteredVendorBills.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">ไม่มีบิลคู่ค้าค้างจ่าย</p>
            ) : (
              <div className="space-y-3">
                {filteredVendorBills.map((b: any) => {
                  const net = Number(b.net_amount || b.amount || 0);
                  const gross = Number(b.amount || 0);
                  const wht = Number(b.wht_amount || 0);
                  const acct = cleanAccountNumber(b.vendor_profiles?.bank_account);
                  const vendorName = b.vendor_profiles?.company_name || "ยังไม่ผูกคู่ค้า";
                  const isCopied = copiedId === `vb-${b.id}`;
                  return (
                    <Card key={b.id}>
                      <CardContent className="pt-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-primary shrink-0"
                              checked={selectedBillIds.includes(b.id)}
                              onChange={(e) => setSelectedBillIds((prev) =>
                                e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id)
                              )}
                              aria-label="เลือกบิลนี้เพื่อรวมเป็นใบสรุปการจ่าย"
                            />
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {b.receipt_no && <span className="font-mono text-primary mr-1">{b.receipt_no}</span>}
                                {vendorName}
                              </p>
                              <p className="text-sm text-muted-foreground truncate">
                                {b.invoice_number ? `${b.invoice_number} • ` : ""}{b.description || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <CalendarClock className="h-3 w-3" />
                                ส่งเข้าเมื่อ {formatSubmittedAt(b.created_at)}
                                {b.submitted_via_line_display_name && (
                                  <span className="ml-1">· โดย {b.submitted_via_line_display_name}</span>
                                )}
                                {b.source === "line" && <span className="ml-1">· ผ่าน LINE</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={b.status === "approved" ? "default" : "secondary"}>
                              {b.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                            </Badge>
                            {b.voucher_id && <Badge variant="outline" className="text-[10px]">อยู่ในใบสรุป P</Badge>}
                          </div>
                        </div>


                        {/* Bank account block */}
                        {b.vendor_profiles?.bank_name && acct && (
                          <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground truncate">{b.vendor_profiles.bank_name} — {vendorName}</p>
                              <p className="font-mono text-lg font-bold tracking-wider">{acct}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(acct);
                                setCopiedId(`vb-${b.id}`);
                                setTimeout(() => setCopiedId(null), 2000);
                                toast({ title: "คัดลอกเลขบัญชีแล้ว", description: acct });
                              }}
                            >
                              {isCopied ? (
                                <><Check className="h-4 w-4 mr-1 text-green-500" />คัดลอกแล้ว</>
                              ) : (
                                <><Copy className="h-4 w-4 mr-1" />คัดลอก</>
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Dates */}
                        {(b.invoice_date || b.due_date) && (
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            {b.invoice_date && <span>วันที่บิล: {b.invoice_date}</span>}
                            {b.due_date && <span className="text-amber-600">ครบกำหนด: {b.due_date}</span>}
                          </div>
                        )}

                        {/* Amount breakdown */}
                        <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ยอดบิล (Gross)</span>
                            <span className="font-medium">{gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          {wht > 0 && (
                            <div className="flex justify-between text-destructive">
                              <span>หัก ณ ที่จ่าย</span>
                              <span>-{wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between items-center">
                            <span className="font-bold">ยอดโอนจริง (Net)</span>
                            <span className="font-bold text-primary">
                              {net.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                            </span>
                          </div>
                        </div>

                        {/* Copy / view bill */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              navigator.clipboard.writeText(net.toFixed(2));
                              toast({ title: "คัดลอกยอดโอน", description: `${net.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท` });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-1" />คัดลอกยอดโอน
                          </Button>
                          {b.file_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => openVendorBillFile(b.file_url)}
                            >
                              <FileText className="h-4 w-4 mr-1" />ดูบิล
                            </Button>
                          )}
                        </div>
                        <Button variant="secondary" size="sm" className="w-full" onClick={() => setPaySheetBill(b)}>
                          <Pencil className="h-4 w-4 mr-1" />ตรวจยอด / หัก ณ ที่จ่าย ก่อนจ่าย
                        </Button>


                        {/* Send info to accounting */}
                        {acct && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled={sending === `vb-${b.id}`}
                            onClick={() => sendInfoToAccounting(
                              `vb-${b.id}`,
                              `💰 ขอโอนเงินบิลคู่ค้า\n\n🏢 ${vendorName}${b.invoice_number ? `\n📋 ${b.invoice_number}` : ""}${b.description ? `\n📝 ${b.description}` : ""}\n💵 ยอดโอน: ${net.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท${b.due_date ? `\n📅 ครบกำหนด: ${b.due_date}` : ""}\n\n🏦 ${b.vendor_profiles?.bank_name ?? ""}\nเลขบัญชี: ${acct}\nชื่อบัญชี: ${vendorName}`
                            )}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            {sending === `vb-${b.id}` ? "กำลังส่ง..." : "ส่งข้อมูลโอนให้บัญชี"}
                          </Button>
                        )}

                        {/* FlowAccount quick links */}
                        <div className="border-t pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] text-muted-foreground">🔗 FlowAccount</p>
                            {b.flowaccount_push_status === "success" && (
                              <Badge variant="secondary" className="text-[10px]">🟢 อยู่ใน FA</Badge>
                            )}
                            {b.flowaccount_push_status === "failed" && (
                              <Badge variant="destructive" className="text-[10px]">🔴 ส่งไม่สำเร็จ</Badge>
                            )}
                            {!b.flowaccount_push_status && (
                              <Badge variant="outline" className="text-[10px]">⚪ ยังไม่ส่ง</Badge>
                            )}
                          </div>
                          {b.flowaccount_push_error && (
                            <p className="text-[10px] text-destructive mb-2 break-words">{b.flowaccount_push_error}</p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {b.flowaccount_expense_url && (
                              <Button variant="outline" size="sm" asChild className="col-span-2 border-green-300 bg-green-50 text-green-700 hover:bg-green-100">
                                <a href={b.flowaccount_expense_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />Expense Note (FA)
                                </a>
                              </Button>
                            )}
                            {b.flowaccount_bill_url ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={b.flowaccount_bill_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />ใบกำกับซื้อ
                                </a>
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" asChild>
                                <a href={FA_LINKS.uploadBill} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />สร้างบิลเอง
                                </a>
                              </Button>
                            )}
                          </div>
                          {Number(b.wht_amount) > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
                              💡 มี WHT {Number(b.wht_amount).toLocaleString()} ฿ — ตอนบันทึกจ่ายใน FlowAccount ให้ติ๊ก "หัก ณ ที่จ่าย" ระบบ FA จะออกหนังสือ WHT ให้อัตโนมัติ
                            </p>
                          )}
                          {b.receipt_no && (
                            <div className="mt-2 rounded-md bg-primary/5 border border-primary/20 p-2">
                              <p className="text-[10px] text-muted-foreground">รหัสตัดจ่าย — ใส่ในช่องบันทึกช่วยจำของสลิป</p>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold">@{b.receipt_no}</span>
                                <Button variant="outline" size="sm" onClick={() => {
                                  navigator.clipboard.writeText(`@${b.receipt_no}`);
                                  toast({ title: "คัดลอกรหัสตัดจ่าย", description: `@${b.receipt_no}` });
                                }}>
                                  <Copy className="h-3 w-3 mr-1" />คัดลอก
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {b.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "approve" })}
                                disabled={vendorBillActionMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />อนุมัติ
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "reject" })}
                              >
                                <XCircle className="h-4 w-4 mr-1" />ปฏิเสธ
                              </Button>
                            </>
                          )}
                          {b.status === "approved" && (
                            <>
                              <Button
                                size="sm"
                                className="flex-1"
                                 onClick={() => setVendorPayDialog(b)}
                                 disabled={markVendorBillPaidMutation.isPending}
                               >
                                 <Upload className="h-4 w-4 mr-1" />จ่ายแล้ว + แนบสลิป
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "reject" })}
                              >
                                <XCircle className="h-4 w-4 mr-1" />ยกเลิก
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Mark as Paid Dialog */}
        <Dialog open={!!payDialog} onOpenChange={(open) => { if (!open) setPayDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                ยืนยันการจ่ายเงิน
              </DialogTitle>
            </DialogHeader>
            {payDialog && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">{payDialog.staff_profiles?.staff_name}</p>
                  <p className="text-muted-foreground">{payDialog.event_name || "ไม่ระบุอีเวนท์"}</p>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span>Gross</span>
                      <span>{Number(payDialog.gross_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Number(payDialog.wht_amount) > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>WHT {Number(payDialog.wht_rate)}%</span>
                        <span>-{Number(payDialog.wht_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-primary border-t pt-1">
                      <span>ยอดโอน</span>
                      <span>{Number(payDialog.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                    </div>
                  </div>
                </div>
                {Number(payDialog.wht_amount) > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                    ⚠️ ระบบจะบันทึกภาษีหัก ณ ที่จ่าย {Number(payDialog.wht_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท เป็นค่าใช้จ่ายเครดิต (รอนำส่งสรรพากร)
                  </p>
                )}
                <p className="text-xs text-muted-foreground bg-muted/60 rounded p-2">
                  📎 แนบสลิปที่นี่แล้ว ไม่ต้องส่งสลิปใบเดียวกันเข้าไลน์อีก (ถ้าส่งไป ระบบจะรวมให้รายการเดิม ไม่บันทึกซ้ำ)
                </p>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">แนบสลิปเงินโอน</p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "กำลังอัปโหลด..." : "เลือกไฟล์"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* จ่ายบิลคู่ค้า + แนบสลิป */}
        <Dialog open={!!vendorPayDialog} onOpenChange={(open) => { if (!open) setVendorPayDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                ยืนยันการจ่ายบิลคู่ค้า
              </DialogTitle>
            </DialogHeader>
            {vendorPayDialog && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">
                    {vendorPayDialog.vendor_profiles?.company_name || vendorPayDialog.submitted_via_line_display_name || "ไม่ระบุคู่ค้า"}
                  </p>
                  <p className="text-muted-foreground">
                    {vendorPayDialog.receipt_no ? `${vendorPayDialog.receipt_no} · ` : ""}
                    {vendorPayDialog.description || "ไม่มีรายละเอียด"}
                  </p>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span>ยอดก่อน VAT</span>
                      <span>{Number(vendorPayDialog.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Number(vendorPayDialog.vat_amount) > 0 && (
                      <div className="flex justify-between">
                        <span>VAT</span>
                        <span>{Number(vendorPayDialog.vat_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {Number(vendorPayDialog.wht_amount) > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>หัก ณ ที่จ่าย {Number(vendorPayDialog.wht_rate)}%</span>
                        <span>-{Number(vendorPayDialog.wht_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-primary border-t pt-1">
                      <span>ยอดโอน</span>
                      <span>
                        {Number(
                          vendorPayDialog.net_amount ??
                            (Number(vendorPayDialog.amount || 0) + Number(vendorPayDialog.vat_amount || 0) - Number(vendorPayDialog.wht_amount || 0))
                        ).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                      </span>
                    </div>
                  </div>
                </div>
                {vendorPayDialog.voucher_id && (
                  <p className="text-xs text-primary bg-primary/5 rounded p-2">
                    บิลนี้อยู่ในใบสรุปการจ่าย — ระบบจะบันทึกจ่ายทุกรายการในใบสรุปเดียวกัน โดยใช้สลิปใบนี้เป็นหลักฐาน
                  </p>
                )}
                <p className="text-xs text-muted-foreground bg-muted/60 rounded p-2">
                  ระบบจะสร้างรายการค่าใช้จ่ายในบัญชีให้อัตโนมัติ (ถ้ายังไม่มีรายการผูกไว้)
                  <br />📎 แนบสลิปที่นี่แล้ว ไม่ต้องส่งสลิปใบเดียวกันเข้าไลน์อีก (ถ้าส่งไป ระบบจะรวมให้รายการเดิม ไม่บันทึกซ้ำ)
                </p>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">แนบสลิปเงินโอน</p>
                  <Button variant="outline" onClick={() => vendorFileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? "กำลังอัปโหลด..." : "เลือกไฟล์"}
                  </Button>
                  <input
                    ref={vendorFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleVendorFileSelected}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject claim confirmation */}
        <AlertDialog open={!!rejectClaim} onOpenChange={(o) => !o && setRejectClaim(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันปฏิเสธใบเบิก</AlertDialogTitle>
              <AlertDialogDescription>
                ปฏิเสธใบเบิกของ <span className="font-semibold">{rejectClaim?.staff_name}</span> ยอด{" "}
                <span className="font-semibold">{rejectClaim?.amount.toLocaleString()} ฿</span> ใช่หรือไม่?
                <br />ระบบจะเปลี่ยนสถานะเป็น "ปฏิเสธ" และไม่สามารถอนุมัติได้อีก
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => rejectClaim && claimActionMutation.mutate({ id: rejectClaim.id, action: "reject" })}
              >
                ปฏิเสธ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Revert claim confirmation */}
        <AlertDialog open={!!revertClaim} onOpenChange={(o) => !o && setRevertClaim(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันย้อนสถานะใบเบิก</AlertDialogTitle>
              <AlertDialogDescription>
                ย้อนสถานะใบเบิกของ <span className="font-semibold">{revertClaim?.staff_name}</span> ยอด{" "}
                <span className="font-semibold">{revertClaim?.amount.toLocaleString()} ฿</span> กลับเป็น "รออนุมัติ" ใช่หรือไม่?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => revertClaim && claimActionMutation.mutate({ id: revertClaim.id, action: "revert" })}
              >
                ยืนยันย้อนสถานะ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject staff invoice confirmation */}
        <AlertDialog open={!!rejectInvoice} onOpenChange={(o) => !o && setRejectInvoice(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันปฏิเสธใบเรียกเก็บ</AlertDialogTitle>
              <AlertDialogDescription>
                ปฏิเสธใบเรียกเก็บของ <span className="font-semibold">{rejectInvoice?.staff_name}</span> ยอด{" "}
                <span className="font-semibold">{rejectInvoice?.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span> ใช่หรือไม่?
                <br />ระบบจะเปลี่ยนสถานะเป็น "ปฏิเสธ" (ดูประวัติได้ภายหลัง)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => rejectInvoice && invoiceActionMutation.mutate({ id: rejectInvoice.id, action: "reject" })}
              >
                ปฏิเสธ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      <AdminVendorBillSheet open={adminBillOpen} onOpenChange={setAdminBillOpen} />
      <VendorBillPaySheet bill={paySheetBill} onOpenChange={(o) => { if (!o) setPaySheetBill(null); }} />
    </div>
  );
};

export default PaymentQueue;
