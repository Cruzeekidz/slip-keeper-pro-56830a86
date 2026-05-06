import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, CreditCard, CheckCircle, Trash2, Gift, Plus, MessageCircle, Upload, ImageIcon, Banknote, Wallet, Pencil, Receipt, Link2, Search, Copy, AlertTriangle, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { buildUploadPath } from "@/lib/storage-path";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StaffReimbursementTab from "@/components/staff/StaffReimbursementTab";
import ReopenInvoiceDialog from "@/components/staff/ReopenInvoiceDialog";
import InvoiceAuditHistoryDialog from "@/components/staff/InvoiceAuditHistoryDialog";
import LinkExpenseDialog from "@/components/staff/LinkExpenseDialog";
import BulkReconcileDialog from "@/components/staff/BulkReconcileDialog";
import { findMatchingExpenses } from "@/hooks/useInvoiceMatching";
import { useUserRole } from "@/hooks/useUserRole";
import { Unlock, History, XCircle } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "secondary",
  submitted: "default",
  approved: "outline",
  paid: "default",
  rejected: "destructive",
};

const statusLabels: Record<string, string> = {
  draft: "ฉบับร่าง",
  submitted: "ส่งแล้ว",
  approved: "อนุมัติแล้ว",
  paid: "จ่ายแล้ว",
  rejected: "ปฏิเสธ",
};

const StaffPayments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const canReopen = isAdmin || isSuperAdmin;
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterEvent, setFilterEvent] = useState("all");
  const [reopenDialog, setReopenDialog] = useState<any | null>(null);
  const [historyDialog, setHistoryDialog] = useState<any | null>(null);
  const [bonusDialog, setBonusDialog] = useState<{ id: string; current: number } | null>(null);
  const [bonusValue, setBonusValue] = useState(0);
  const [createDialog, setCreateDialog] = useState(false);
  const [lineDialog, setLineDialog] = useState<{ staffName: string; lineUserId: string | null } | null>(null);
  const [lineMessage, setLineMessage] = useState("");
  const [paySlipDialog, setPaySlipDialog] = useState<any | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [payMethod, setPayMethod] = useState<"transfer" | "cash" | "credit">("transfer");
  const slipFileRef = useRef<HTMLInputElement>(null);
  const cashSlipRef = useRef<HTMLInputElement>(null);
  const [cashNote, setCashNote] = useState("");
  const [cashSlipFile, setCashSlipFile] = useState<File | null>(null);
  const [creditDueDate, setCreditDueDate] = useState<Date | undefined>(undefined);
  const [creditNote, setCreditNote] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
    toast({ title: "คัดลอกแล้ว", description: text });
  };

  const resetPayDialog = () => {
    setPaySlipDialog(null);
    setPayMethod("transfer");
    setCashNote("");
    setCashSlipFile(null);
    setCreditDueDate(undefined);
    setCreditNote("");
  };
  const [editDialog, setEditDialog] = useState<any | null>(null);
  const [linkDialog, setLinkDialog] = useState<any | null>(null);
  const [bulkReconcileOpen, setBulkReconcileOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ invoice: any; matches: any[]; pendingPaymentMethod: string; pendingSlipFile?: File } | null>(null);
  const [editForm, setEditForm] = useState({
    staff_id: "",
    event_name: "",
    days_worked: 1,
    daily_rate: 0,
    work_start_date: "",
    work_end_date: "",
    notes: "",
    wht_mode: "inclusive" as "inclusive" | "exclusive" | "none",
    bonus_amount: 0,
  });

  // Create invoice form state
  const [createForm, setCreateForm] = useState({
    staff_id: "",
    event_name: "",
    days_worked: 1,
    daily_rate: 0,
    work_start_date: "",
    work_end_date: "",
    notes: "",
    wht_mode: "inclusive" as "inclusive" | "exclusive" | "none",
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["staff-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoices")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account, tax_id, email, address, line_user_id, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, staff_name, nickname, daily_rate, line_user_id")
        .eq("is_active", true)
        .order("staff_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["event-registry-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registry")
        .select("id, event_name")
        .eq("is_active", true)
        .order("event_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      const { error } = await supabase.from("staff_invoices").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      toast({ title: "อัปเดตสถานะสำเร็จ" });
    },
  });

  const toggleWhtModeMutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: "inclusive" | "exclusive" | "none" }) => {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) throw new Error("Not found");
      const baseAmount = Number(inv.days_worked) * Number(inv.daily_rate) + Number(inv.bonus_amount || 0);
      let grossAmount: number;
      let whtRate: number;
      let whtAmount: number;
      let netAmount: number;
      if (mode === "none") {
        grossAmount = baseAmount;
        whtRate = 0;
        whtAmount = 0;
        netAmount = baseAmount;
      } else if (mode === "inclusive") {
        grossAmount = baseAmount;
        whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      } else {
        grossAmount = Math.round(baseAmount / 0.97 * 100) / 100;
        whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      }
      const { error } = await supabase.from("staff_invoices").update({
        gross_amount: grossAmount,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        net_amount: netAmount,
        notes: `WHT mode: ${mode}`,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      toast({ title: "คำนวณภาษีใหม่แล้ว" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, slipFile, paymentMethod, extraNote, dueDate }: { id: string; slipFile?: File; paymentMethod: string; extraNote?: string; dueDate?: string }) => {
      if (!user) throw new Error("Not authenticated");
      let slipPath: string | null = null;

      if (slipFile) {
        const ext = slipFile.name.split(".").pop() || "jpg";
        const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_${id}.${ext}`);
        const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, slipFile, {
          contentType: slipFile.type,
        });
        if (uploadErr) throw uploadErr;
        slipPath = path;
      }

      const noteParts: string[] = [];
      if (paymentMethod !== "transfer") {
        noteParts.push(`จ่ายด้วย: ${paymentMethod === "cash" ? "เงินสด" : "เครดิต"}`);
      }
      if (dueDate) noteParts.push(`กำหนดชำระ: ${dueDate}`);
      if (extraNote && extraNote.trim()) noteParts.push(extraNote.trim());

      const updates: Record<string, unknown> = {
        status: "paid",
        paid_at: new Date().toISOString(),
        notes: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
      };
      if (slipPath) updates.payment_slip_url = slipPath;

      const { error } = await supabase.from("staff_invoices").update(updates as any).eq("id", id);
      if (error) throw error;

      // Find the invoice to create expenses
      const inv = invoices.find((i: any) => i.id === id);

      // Look up project_tag once (shared by Gross + WHT expenses)
      let projectTag: string | null = null;
      if (inv?.event_id) {
        const { data: evReg } = await supabase
          .from("event_registry")
          .select("project_tag")
          .eq("id", inv.event_id)
          .maybeSingle();
        if (evReg) projectTag = evReg.project_tag;
      }

      const methodLabel = paymentMethod === "credit" ? "เครดิต" : (paymentMethod === "cash" ? "เงินสด" : "โอนเงิน");
      const paidDateStr = new Date().toISOString().split("T")[0];

      // Derive category_group from project_tag prefix so BCC Next / Kukanang
      // wage expenses don't get mis-routed into the EVENT (Cruzee) bucket
      const groupFromTag = (tag: string | null): string => {
        if (!tag) return "EVENT";
        if (tag.startsWith("BCCNEXT-")) return "ENTITY_BCC_NEXT";
        if (tag.startsWith("KUKAN-")) return "ENTITY_KUKANANG";
        if (tag.startsWith("PROG-")) return "PROGRAM";
        return "EVENT";
      };
      const wageGroup = groupFromTag(projectTag);

      // ★ Create wage expense (Gross) — links slip to accounting file
      // Skip for credit (not actually paid yet) and skip if already linked (re-pay scenario)
      if (inv && paymentMethod !== "credit" && !inv.matched_expense_id) {
        const { data: wageExp, error: wageErr } = await supabase.from("expenses").insert({
          user_id: user.id,
          amount: Number(inv.gross_amount),
          category: "ค่าจ้างทีมงาน",
          subcategory: (inv.staff_profiles as any)?.position || "Staff",
          description: `ค่าจ้าง ${inv.staff_profiles?.staff_name || ""} - ${inv.event_name || ""} - ${inv.invoice_number}`.trim(),
          expense_date: paidDateStr,
          transaction_direction: "EXPENSE",
          transaction_type: "BUSINESS",
          category_group: wageGroup,
          project_tag: projectTag,
          staff_name: inv.staff_profiles?.staff_name || null,
          event_name: inv.event_name || null,
          receiver: inv.staff_profiles?.staff_name || null,
          receipt_url: slipPath,
          is_cash: paymentMethod === "cash",
          memo_text: `${inv.invoice_number} - จ่ายด้วย${methodLabel} | Gross ${Number(inv.gross_amount).toFixed(2)} | WHT ${Number(inv.wht_amount).toFixed(2)} | Net ${Number(inv.net_amount).toFixed(2)}`,
        }).select("id").maybeSingle();

        if (wageErr) {
          console.error("Failed to create wage expense:", wageErr);
          toast({
            title: "⚠️ บันทึกค่าใช้จ่ายไม่สำเร็จ",
            description: `ใบ ${inv.invoice_number}: ${wageErr.message}. กรุณาลองใหม่หรือสร้างรายการเอง`,
            variant: "destructive",
          });
          throw new Error(`Wage expense insert failed: ${wageErr.message}`);
        }
        if (wageExp?.id) {
          const { error: linkErr } = await supabase.from("staff_invoices").update({ matched_expense_id: wageExp.id }).eq("id", id);
          if (linkErr) console.error("Failed to link expense to invoice:", linkErr);
        }
      }

      if (inv && Number(inv.wht_amount) > 0) {
        const whtExpenseType = paymentMethod === "credit" ? "เครดิต" : (paymentMethod === "cash" ? "เงินสด" : "โอนเงิน");
        await supabase.from("expenses").insert({
          user_id: user.id,
          amount: Number(inv.wht_amount),
          category: "ภาษีหัก ณ ที่จ่าย",
          subcategory: "Staff",
          description: `ภาษีหัก ณ ที่จ่าย 3% - ${inv.staff_profiles?.staff_name || ""} ${inv.event_name || ""}`.trim(),
          expense_date: new Date().toISOString().split("T")[0],
          transaction_direction: "EXPENSE",
          transaction_type: "BUSINESS",
          category_group: wageGroup,
          project_tag: projectTag,
          staff_name: inv.staff_profiles?.staff_name || null,
          event_name: inv.event_name || null,
          receiver: "สรรพากร",
          memo_text: `รอนำส่งสิ้นเดือน - ${inv.invoice_number} - จ่ายด้วย${whtExpenseType}`,
        });
      }

      // Notify staff via LINE (fire-and-forget) — return result so onSuccess can toast
      let notifyResult: { sent?: boolean; reason?: string; staff_name?: string } | null = null;
      if (inv) {
        try {
          const { data: notifyData } = await supabase.functions.invoke("notify-staff-payment", {
            body: {
              staff_id: inv.staff_id,
              payment_method: paymentMethod,
              gross_amount: Number(inv.gross_amount),
              wht_amount: Number(inv.wht_amount),
              net_amount: Number(inv.net_amount),
              paid_at: new Date().toISOString(),
              invoice_number: inv.invoice_number,
              event_name: inv.event_name,
            },
          });
          notifyResult = notifyData as any;
        } catch (err: any) {
          console.error("LINE notify error:", err);
        }
      }

      // Audit log: pay or repay (if previously reopened)
      if (inv) {
        const { data: priorReopen } = await supabase
          .from("staff_invoice_audit_log")
          .select("id")
          .eq("invoice_id", id)
          .eq("action", "reopen")
          .limit(1);
        const action = priorReopen && priorReopen.length > 0 ? "repay" : "pay";
        await supabase.from("staff_invoice_audit_log").insert({
          invoice_id: id,
          invoice_number: inv.invoice_number,
          action,
          old_status: inv.status,
          new_status: "paid",
          changed_by: user.id,
          changed_by_email: user.email,
          new_data: { payment_method: paymentMethod, payment_slip_path: slipPath, net_amount: Number(inv.net_amount) },
        });
      }

      return { notifyResult, staffName: inv?.staff_profiles?.staff_name };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      resetPayDialog();
      toast({ title: "บันทึกการจ่ายเงินสำเร็จ", description: "สลิปถูกผูกเข้าแฟ้มค่าใช้จ่ายให้บัญชีแล้ว" });
      const nr = result?.notifyResult;
      if (nr?.sent) {
        toast({ title: "📲 แจ้งเตือนทีมงานทาง LINE แล้ว" });
      } else if (nr?.reason === "no LINE ID") {
        const portalUrl = `${window.location.origin}/portal?view=quick-link&owner=${nr?.owner_id || ""}`;
        toast({
          title: `⚠️ ${result?.staffName || "ทีมงาน"} ยังไม่ได้ผูก LINE`,
          description: "ส่งลิงก์ 'เชื่อม LINE กับโปรไฟล์เดิม' ในเมนูพอร์ทัลให้ทีมงาน เพื่อให้ได้รับแจ้งเตือนครั้งต่อไป",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const updateBonusMutation = useMutation({
    mutationFn: async ({ id, bonus }: { id: string; bonus: number }) => {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) throw new Error("Not found");
      const newGross = Number(inv.days_worked) * Number(inv.daily_rate) + bonus;
      const newWht = Math.round(newGross * (Number(inv.wht_rate) / 100) * 100) / 100;
      const newNet = newGross - newWht;
      const { error } = await supabase.from("staff_invoices").update({
        bonus_amount: bonus,
        gross_amount: newGross,
        wht_amount: newWht,
        net_amount: newNet,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setBonusDialog(null);
      toast({ title: "บันทึกโบนัสสำเร็จ" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const inv = invoices.find((i: any) => i.id === id);
      const { error } = await supabase.from("staff_invoices").delete().eq("id", id);
      if (error) throw error;
      if (user && inv) {
        await supabase.from("staff_invoice_audit_log").insert({
          invoice_id: id,
          invoice_number: inv.invoice_number,
          action: "delete",
          old_status: inv.status,
          new_status: null,
          changed_by: user.id,
          changed_by_email: user.email,
          old_data: inv,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      toast({ title: "ลบรายการสำเร็จ" });
    },
  });

  const editInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!editDialog) throw new Error("No invoice selected");
      const baseAmount = editForm.days_worked * editForm.daily_rate + editForm.bonus_amount;
      let grossAmount: number, whtRate: number, whtAmount: number, netAmount: number;
      if (editForm.wht_mode === "none") {
        grossAmount = baseAmount; whtRate = 0; whtAmount = 0; netAmount = baseAmount;
      } else if (editForm.wht_mode === "inclusive") {
        grossAmount = baseAmount; whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      } else {
        grossAmount = Math.round(baseAmount / 0.97 * 100) / 100; whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      }
      const newData = {
        staff_id: editForm.staff_id,
        event_name: editForm.event_name || null,
        days_worked: editForm.days_worked,
        daily_rate: editForm.daily_rate,
        bonus_amount: editForm.bonus_amount,
        gross_amount: grossAmount,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        net_amount: netAmount,
        work_start_date: editForm.work_start_date || null,
        work_end_date: editForm.work_end_date || null,
        notes: editForm.notes || null,
      };
      const { error } = await supabase.from("staff_invoices").update(newData).eq("id", editDialog.id);
      if (error) throw error;
      if (user) {
        await supabase.from("staff_invoice_audit_log").insert({
          invoice_id: editDialog.id,
          invoice_number: editDialog.invoice_number,
          action: "edit",
          old_status: editDialog.status,
          new_status: editDialog.status,
          changed_by: user.id,
          changed_by_email: user.email,
          old_data: editDialog,
          new_data: newData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      setEditDialog(null);
      toast({ title: "แก้ไขรายการสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const openEditDialog = (inv: any) => {
    const whtMode = Number(inv.wht_rate) === 0 ? "none" : (inv.notes?.includes("exclusive") ? "exclusive" : "inclusive");
    setEditForm({
      staff_id: inv.staff_id,
      event_name: inv.event_name || "",
      days_worked: Number(inv.days_worked),
      daily_rate: Number(inv.daily_rate),
      work_start_date: inv.work_start_date || "",
      work_end_date: inv.work_end_date || "",
      notes: inv.notes || "",
      wht_mode: whtMode,
      bonus_amount: Number(inv.bonus_amount || 0),
    });
    setEditDialog(inv);
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!createForm.staff_id) throw new Error("กรุณาเลือกทีมงาน");

      const baseAmount = createForm.days_worked * createForm.daily_rate;
      let grossAmount: number;
      let whtRate: number;
      let whtAmount: number;
      let netAmount: number;
      if (createForm.wht_mode === "none") {
        grossAmount = baseAmount;
        whtRate = 0;
        whtAmount = 0;
        netAmount = baseAmount;
      } else if (createForm.wht_mode === "inclusive") {
        grossAmount = baseAmount;
        whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      } else {
        grossAmount = Math.round(baseAmount / 0.97 * 100) / 100;
        whtRate = 3;
        whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
        netAmount = grossAmount - whtAmount;
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      const { error } = await supabase.from("staff_invoices").insert({
        user_id: user.id,
        staff_id: createForm.staff_id,
        invoice_number: invoiceNumber,
        event_name: createForm.event_name || null,
        days_worked: createForm.days_worked,
        daily_rate: createForm.daily_rate,
        gross_amount: grossAmount,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        net_amount: netAmount,
        work_start_date: createForm.work_start_date || null,
        work_end_date: createForm.work_end_date || null,
        notes: createForm.notes || null,
        status: "approved",
        submitted_via: "admin",
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setCreateDialog(false);
      setCreateForm({ staff_id: "", event_name: "", days_worked: 1, daily_rate: 0, work_start_date: "", work_end_date: "", notes: "", wht_mode: "inclusive" });
      toast({ title: "สร้างรายการค่าใช้จ่ายสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const sendLineMutation = useMutation({
    mutationFn: async ({ lineUserId, message }: { lineUserId: string; message: string }) => {
      const { error } = await supabase.functions.invoke("send-reminder-line", {
        body: { lineUserId, message },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLineDialog(null);
      setLineMessage("");
      toast({ title: "ส่งข้อความ LINE สำเร็จ" });
    },
    onError: () => {
      toast({ title: "ส่งข้อความไม่สำเร็จ", variant: "destructive" });
    },
  });

  // Backfill missing wage expenses for paid invoices that are not linked
  const backfillMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data: orphans, error: fetchErr } = await supabase
        .from("staff_invoices")
        .select("id, invoice_number, gross_amount, wht_amount, net_amount, event_name, event_id, paid_at, payment_slip_url, staff_id, staff_profiles(staff_name, position)")
        .eq("user_id", user.id)
        .eq("status", "paid")
        .is("matched_expense_id", null);
      if (fetchErr) throw fetchErr;
      if (!orphans || orphans.length === 0) return { fixed: 0, failed: 0, total: 0 };

      let fixed = 0, failed = 0;
      for (const inv of orphans as any[]) {
        try {
          let projectTag: string | null = null;
          if (inv.event_id) {
            const { data: ev } = await supabase.from("event_registry").select("project_tag").eq("id", inv.event_id).maybeSingle();
            if (ev) projectTag = ev.project_tag;
          }
          const paidDate = inv.paid_at ? inv.paid_at.split("T")[0] : new Date().toISOString().split("T")[0];
          const staffName = inv.staff_profiles?.staff_name || "";
          const wageGroup = projectTag?.startsWith("BCCNEXT-") ? "ENTITY_BCC_NEXT"
            : projectTag?.startsWith("KUKAN-") ? "ENTITY_KUKANANG"
            : projectTag?.startsWith("PROG-") ? "PROGRAM"
            : "EVENT";

          const { data: wageExp, error: wageErr } = await supabase.from("expenses").insert({
            user_id: user.id,
            amount: Number(inv.gross_amount),
            category: "ค่าจ้างทีมงาน",
            subcategory: inv.staff_profiles?.position || "Staff",
            description: `ค่าจ้าง ${staffName} - ${inv.event_name || ""} - ${inv.invoice_number}`.trim(),
            expense_date: paidDate,
            transaction_direction: "EXPENSE",
            transaction_type: "BUSINESS",
            category_group: wageGroup,
            project_tag: projectTag,
            staff_name: staffName || null,
            event_name: inv.event_name || null,
            receiver: staffName || null,
            receipt_url: inv.payment_slip_url || null,
            is_cash: false,
            memo_text: `${inv.invoice_number} | Gross ${Number(inv.gross_amount).toFixed(2)} | WHT ${Number(inv.wht_amount).toFixed(2)} | Net ${Number(inv.net_amount).toFixed(2)} [backfill]`,
          }).select("id").maybeSingle();
          if (wageErr || !wageExp?.id) throw wageErr || new Error("no id returned");

          await supabase.from("staff_invoices").update({ matched_expense_id: wageExp.id }).eq("id", inv.id);

          if (Number(inv.wht_amount) > 0) {
            await supabase.from("expenses").insert({
              user_id: user.id,
              amount: Number(inv.wht_amount),
              category: "ภาษีหัก ณ ที่จ่าย",
              subcategory: "Staff",
              description: `ภาษีหัก ณ ที่จ่าย 3% - ${staffName} ${inv.event_name || ""}`.trim(),
              expense_date: paidDate,
              transaction_direction: "EXPENSE",
              transaction_type: "BUSINESS",
              category_group: wageGroup,
              project_tag: projectTag,
              staff_name: staffName || null,
              event_name: inv.event_name || null,
              receiver: "สรรพากร",
              memo_text: `รอนำส่งสิ้นเดือน - ${inv.invoice_number} [backfill]`,
            });
          }
          fixed++;
        } catch (e) {
          console.error("Backfill failed for", inv.invoice_number, e);
          failed++;
        }
      }
      return { fixed, failed, total: orphans.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      if (result.total === 0) {
        toast({ title: "✅ ไม่มีรายการที่ต้องซ่อม", description: "ใบที่จ่ายแล้วทุกใบลิงก์เรียบร้อย" });
      } else {
        toast({
          title: `🔧 Backfill เสร็จสิ้น`,
          description: `สำเร็จ ${result.fixed}/${result.total} รายการ${result.failed > 0 ? ` (ล้มเหลว ${result.failed})` : ""}`,
          variant: result.failed > 0 ? "destructive" : "default",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Backfill ล้มเหลว", description: err.message, variant: "destructive" });
    },
  });

  // Duplicate Guard: ตรวจหา expense ที่อาจตรงกันก่อนสร้างใหม่
  const triggerPayWithGuard = async (params: { invoice: any; paymentMethod: string; slipFile?: File; extraNote?: string; dueDate?: string }) => {
    const { invoice, paymentMethod, slipFile, extraNote, dueDate } = params;
    if (!user) return;
    try {
      const matches = await findMatchingExpenses(
        {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          net_amount: Number(invoice.net_amount),
          staff_profiles: invoice.staff_profiles,
        },
        user.id,
        { centerDate: new Date().toISOString().split("T")[0] }
      );
      if (matches.length > 0) {
        setDuplicateWarning({ invoice, matches, pendingPaymentMethod: paymentMethod, pendingSlipFile: slipFile });
        return;
      }
    } catch (e) {
      // ถ้า scan ล้มเหลว ก็ปล่อยให้สร้างปกติ
    }
    markPaidMutation.mutate({ id: invoice.id, slipFile, paymentMethod, extraNote, dueDate });
  };

  // Auto-fill daily_rate when staff selected
  const handleStaffSelect = (staffId: string) => {
    const staff = staffList.find((s) => s.id === staffId);
    setCreateForm((prev) => ({
      ...prev,
      staff_id: staffId,
      daily_rate: staff ? Number(staff.daily_rate) : 0,
    }));
  };

  const createBaseAmount = createForm.days_worked * createForm.daily_rate;
  const createWhtRate = createForm.wht_mode === "none" ? 0 : 3;
  const createGross = createForm.wht_mode === "exclusive" ? Math.round(createBaseAmount / 0.97 * 100) / 100 : createBaseAmount;
  const createWht = createForm.wht_mode === "none" ? 0 : Math.round(createGross * 0.03 * 100) / 100;
  const createNet = createGross - createWht;

  const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const invoiceMonthOf = (i: any): string | null => {
    const raw = i.work_start_date || i.work_end_date || i.paid_at || i.submitted_at || i.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const uniqueMonths = Array.from(new Set((invoices as any[]).map(invoiceMonthOf).filter(Boolean) as string[])).sort().reverse();
  const uniqueEvents = Array.from(new Set((invoices as any[]).map((i) => i.event_name).filter(Boolean) as string[])).sort();

  let filtered = filterStatus === "all" ? invoices : (invoices as any[]).filter((i: any) => i.status === filterStatus);
  if (filterMonth !== "all") filtered = (filtered as any[]).filter((i: any) => invoiceMonthOf(i) === filterMonth);
  if (filterEvent !== "all") filtered = (filtered as any[]).filter((i: any) => i.event_name === filterEvent);

  const totalGross = filtered.reduce((sum: number, i: any) => sum + Number(i.gross_amount), 0);
  const totalWht = filtered.reduce((sum: number, i: any) => sum + Number(i.wht_amount), 0);
  const totalNet = filtered.reduce((sum: number, i: any) => sum + Number(i.net_amount), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CreditCard className="h-6 w-6" />
          <h1 className="text-xl font-bold">จัดการจ่ายเงินทีมงาน</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => navigate("/payment-queue")} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Banknote className="h-4 w-4 mr-1" />รอจ่ายเงิน
            </Button>
            <Button onClick={() => setBulkReconcileOpen(true)} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground" title="ค้นหาและเชื่อมรายการอัตโนมัติ">
              <Search className="h-4 w-4 mr-1" />เชื่อมอัตโนมัติ
            </Button>
            <Button
              onClick={() => {
                if (confirm("สร้างรายการค่าใช้จ่ายให้ใบที่จ่ายแล้วแต่ยังไม่ลิงก์ทั้งหมด?")) {
                  backfillMutation.mutate();
                }
              }}
              disabled={backfillMutation.isPending}
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-primary-foreground"
              title="สร้าง expense สำหรับใบที่ matched_expense_id ยังว่าง"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />{backfillMutation.isPending ? "กำลังซ่อม..." : "Backfill"}
            </Button>
            <Button onClick={() => setCreateDialog(true)} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />สร้างรายการ
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <Tabs defaultValue="invoices" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invoices"><CreditCard className="h-4 w-4 mr-1" />ค่าแรงทีมงาน</TabsTrigger>
            <TabsTrigger value="reimbursement"><Receipt className="h-4 w-4 mr-1" />เบิกค่าใช้จ่าย</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="space-y-4 mt-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ค่าแรงรวม (Gross)</p>
              <p className="text-xl font-bold">{totalGross.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">หัก ณ ที่จ่าย 3%</p>
              <p className="text-xl font-bold text-destructive">{totalWht.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ยอดจ่ายสุทธิ (Net)</p>
              <p className="text-xl font-bold text-primary">{totalNet.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">สถานะ:</span>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="submitted">ส่งแล้ว</SelectItem>
              <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
              <SelectItem value="paid">จ่ายแล้ว</SelectItem>
              <SelectItem value="draft">ฉบับร่าง</SelectItem>
              <SelectItem value="rejected">ปฏิเสธ</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} รายการ</span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">ไม่มีรายการ</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>ทีมงาน / เลขผู้เสียภาษี</TableHead>
                      <TableHead>อีเวนท์</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead className="text-right">วัน</TableHead>
                      <TableHead className="text-right">ค่าแรง/วัน</TableHead>
                      <TableHead className="text-right">โบนัส</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">หัก 3%</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{inv.staff_profiles?.staff_name}</span>
                            {inv.staff_profiles?.nickname && (
                              <span className="text-muted-foreground text-xs ml-1">({inv.staff_profiles.nickname})</span>
                            )}
                          </div>
                          {inv.staff_profiles?.tax_id && (
                            <div className="text-xs text-muted-foreground font-mono">{inv.staff_profiles.tax_id}</div>
                          )}
                        </TableCell>
                        <TableCell>{inv.event_name || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {(() => {
                            const thMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
                            const fmt = (d?: string | null) => {
                              if (!d) return null;
                              const dt = new Date(d);
                              if (isNaN(dt.getTime())) return null;
                              return `${dt.getDate()} ${thMonths[dt.getMonth()]} ${(dt.getFullYear() + 543).toString().slice(-2)}`;
                            };
                            const billed = fmt(inv.submitted_at || inv.created_at);
                            const paid = fmt(inv.paid_at);
                            return (
                              <div className="space-y-0.5">
                                <div className="text-muted-foreground">📋 {billed || "-"}</div>
                                <div className={paid ? "text-success font-medium" : "text-muted-foreground"}>
                                  💸 {paid || "-"}
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">{inv.days_worked}</TableCell>
                        <TableCell className="text-right">{Number(inv.daily_rate).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => { setBonusDialog({ id: inv.id, current: Number(inv.bonus_amount || 0) }); setBonusValue(Number(inv.bonus_amount || 0)); }}
                          >
                            {Number(inv.bonus_amount || 0) > 0 ? (
                              <span className="text-primary font-medium">+{Number(inv.bonus_amount).toLocaleString()}</span>
                            ) : (
                              <Gift className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">{Number(inv.gross_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <span className={Number(inv.wht_amount) > 0 ? "text-destructive" : "text-muted-foreground"}>{Number(inv.wht_amount).toLocaleString()}</span>
                            {inv.status !== "paid" && (
                              <Select
                                value={Number(inv.wht_rate) === 0 ? "none" : (inv.notes?.includes("exclusive") ? "exclusive" : "inclusive")}
                                onValueChange={(v) => toggleWhtModeMutation.mutate({ id: inv.id, mode: v as any })}
                              >
                                <SelectTrigger className="h-6 w-16 text-[10px] px-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inclusive">Gross</SelectItem>
                                  <SelectItem value="exclusive">Net</SelectItem>
                                  <SelectItem value="none">ไม่หัก</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{Number(inv.net_amount).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[inv.status] as any}>
                            {statusLabels[inv.status] || inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {inv.status === "submitted" && (
                              <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "approved" })}>
                                <CheckCircle className="h-3 w-3 mr-1" />อนุมัติ
                              </Button>
                            )}
                            {(inv.status === "submitted" || inv.status === "approved") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive text-destructive hover:bg-destructive/10"
                                title="ปฏิเสธ/ยกเลิกใบเรียกเก็บนี้"
                                onClick={() => {
                                  if (!confirm(`ปฏิเสธใบเรียกเก็บนี้?\n\nสถานะจะเปลี่ยนเป็น 'ปฏิเสธ' (ไม่ลบทิ้ง — ดูประวัติได้)`)) return;
                                  updateStatusMutation.mutate({ id: inv.id, status: "rejected" });
                                }}
                              >
                                <XCircle className="h-3 w-3 mr-1" />ปฏิเสธ
                              </Button>
                            )}
                            {inv.status === "approved" && (
                              <Button size="sm" onClick={() => setPaySlipDialog(inv)}>
                                <Upload className="h-3 w-3 mr-1" />จ่ายแล้ว + แนบสลิป
                              </Button>
                            )}
                            {(inv.status === "approved" || inv.status === "submitted") && !inv.matched_expense_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLinkDialog(inv)}
                                title="เชื่อมกับรายการที่จ่ายแล้ว"
                                className="border-primary text-primary hover:bg-primary/10"
                              >
                                <Link2 className="h-3 w-3 mr-1" />เชื่อม
                              </Button>
                            )}
                            {inv.staff_profiles?.line_user_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLineDialog({ staffName: inv.staff_profiles?.staff_name || "", lineUserId: inv.staff_profiles?.line_user_id })}
                                title="แชท LINE"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            )}
                            {inv.status !== "paid" && (
                              <Button size="sm" variant="outline" onClick={() => openEditDialog(inv)} title="แก้ไข">
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            {inv.status === "paid" && canReopen && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReopenDialog(inv)}
                                title="ย้อนกลับเพื่อแก้ไข"
                                className="border-warning text-warning hover:bg-warning/10"
                              >
                                <Unlock className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHistoryDialog(inv)}
                              title="ประวัติการแก้ไข"
                            >
                              <History className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("ลบรายการนี้?")) deleteMutation.mutate(inv.id); }}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="reimbursement" className="mt-4">
            <StaffReimbursementTab />
          </TabsContent>
        </Tabs>

        <ReopenInvoiceDialog invoice={reopenDialog} onClose={() => setReopenDialog(null)} />
        <InvoiceAuditHistoryDialog invoice={historyDialog} onClose={() => setHistoryDialog(null)} />
        <LinkExpenseDialog invoice={linkDialog} onClose={() => setLinkDialog(null)} />
        <BulkReconcileDialog
          open={bulkReconcileOpen}
          onClose={() => setBulkReconcileOpen(false)}
          invoices={invoices as any}
        />

        {/* Duplicate Guard Dialog */}
        <Dialog open={!!duplicateWarning} onOpenChange={(o) => { if (!o) setDuplicateWarning(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-warning">
                <Link2 className="h-5 w-5" />พบรายการที่อาจจะตรงกัน
              </DialogTitle>
            </DialogHeader>
            {duplicateWarning && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  ระบบพบ {duplicateWarning.matches.length} รายการใน "รายการเคลื่อนไหว" ที่ยอด + ชื่อตรงกับใบเรียกเก็บนี้
                  คุณต้องการเชื่อมกับรายการที่มีอยู่ หรือสร้างรายการใหม่?
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {duplicateWarning.matches.map((m: any) => (
                    <Card key={m.id} className="p-2 hover:border-primary cursor-pointer" onClick={async () => {
                      const { user: u } = { user };
                      if (!user) return;
                      try {
                        const { linkInvoiceToExpense } = await import("@/hooks/useInvoiceMatching");
                        await linkInvoiceToExpense({
                          invoiceId: duplicateWarning.invoice.id,
                          expenseId: m.id,
                          userId: user.id,
                          userEmail: user.email,
                          invoiceNumber: duplicateWarning.invoice.invoice_number,
                          oldStatus: duplicateWarning.invoice.status,
                        });
                        queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
                        queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
                        toast({ title: "เชื่อมรายการสำเร็จ — ไม่มีการสร้างรายการซ้ำ" });
                      } catch (e: any) {
                        toast({ title: "เชื่อมไม่สำเร็จ", description: e.message, variant: "destructive" });
                      } finally {
                        setDuplicateWarning(null);
                        setPaySlipDialog(null);
                      }
                    }}>
                      <div className="text-sm">
                        <div className="font-medium">{m.receiver || m.staff_name || "(ไม่ระบุ)"}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.expense_date} • {Number(m.amount).toLocaleString()} บาท • {m.match_reason}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDuplicateWarning(null)}>ยกเลิก</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      const w = duplicateWarning;
                      setDuplicateWarning(null);
                      markPaidMutation.mutate({
                        id: w.invoice.id,
                        slipFile: w.pendingSlipFile,
                        paymentMethod: w.pendingPaymentMethod,
                      });
                    }}
                  >
                    สร้างรายการใหม่ (ไม่เชื่อม)
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bonus Dialog */}
        <Dialog open={!!bonusDialog} onOpenChange={(open) => { if (!open) setBonusDialog(null); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>เพิ่มโบนัส</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>จำนวนโบนัส (บาท)</Label>
                <Input type="number" value={bonusValue} onChange={(e) => setBonusValue(Number(e.target.value))} min={0} />
              </div>
              <Button className="w-full" onClick={() => bonusDialog && updateBonusMutation.mutate({ id: bonusDialog.id, bonus: bonusValue })} disabled={updateBonusMutation.isPending}>
                {updateBonusMutation.isPending ? "กำลังบันทึก..." : "บันทึกโบนัส"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Invoice Dialog */}
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>สร้างรายการค่าใช้จ่ายทีมงาน</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>ทีมงาน *</Label>
                <Select value={createForm.staff_id} onValueChange={handleStaffSelect}>
                  <SelectTrigger><SelectValue placeholder="เลือกทีมงาน" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.staff_name} {s.nickname ? `(${s.nickname})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>อีเวนท์</Label>
                <Select value={createForm.event_name} onValueChange={(v) => setCreateForm((p) => ({ ...p, event_name: v }))}>
                  <SelectTrigger><SelectValue placeholder="เลือกอีเวนท์ (ไม่บังคับ)" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.event_name}>{e.event_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>จำนวนวัน</Label>
                  <Input type="number" min={0.5} step={0.5} value={createForm.days_worked} onChange={(e) => setCreateForm((p) => ({ ...p, days_worked: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>ค่าแรง/วัน</Label>
                  <Input type="number" min={0} value={createForm.daily_rate} onChange={(e) => setCreateForm((p) => ({ ...p, daily_rate: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>วันเริ่มงาน</Label>
                  <Input type="date" value={createForm.work_start_date} onChange={(e) => setCreateForm((p) => ({ ...p, work_start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>วันสิ้นสุด</Label>
                  <Input type="date" value={createForm.work_end_date} onChange={(e) => setCreateForm((p) => ({ ...p, work_end_date: e.target.value }))} />
                </div>
              </div>

              {/* WHT Mode */}
              <div>
                <Label>โหมดคำนวณภาษี</Label>
                <RadioGroup value={createForm.wht_mode} onValueChange={(v) => setCreateForm((p) => ({ ...p, wht_mode: v as any }))} className="flex flex-wrap gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="inclusive" id="wht-inc-admin" />
                    <Label htmlFor="wht-inc-admin" className="font-normal">รวมภาษีแล้ว</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="exclusive" id="wht-exc-admin" />
                    <Label htmlFor="wht-exc-admin" className="font-normal">ไม่รวมภาษี</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="wht-none-admin" />
                    <Label htmlFor="wht-none-admin" className="font-normal">ไม่หัก ณ ที่จ่าย</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Calculation Summary */}
              {createForm.daily_rate > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>ฐานค่าแรง ({createForm.days_worked} × {createForm.daily_rate.toLocaleString()})</span>
                    <span>{createBaseAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Gross (บันทึกค่าใช้จ่าย)</span>
                    <span>{createGross.toLocaleString()}</span>
                  </div>
                  {createForm.wht_mode !== "none" ? (
                    <>
                      <div className="flex justify-between text-destructive">
                        <span>หัก ณ ที่จ่าย 3%</span>
                        <span>-{createWht.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-bold text-primary border-t pt-1">
                        <span>Net (ยอดโอน)</span>
                        <span>{createNet.toLocaleString()}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-muted-foreground text-xs border-t pt-1">
                      <span>ไม่หัก ณ ที่จ่าย — Net = Gross</span>
                      <span className="font-bold text-primary text-sm">{createNet.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>หมายเหตุ</Label>
                <Textarea value={createForm.notes} onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>

              <Button className="w-full" onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending || !createForm.staff_id}>
                {createInvoiceMutation.isPending ? "กำลังบันทึก..." : "สร้างรายการ"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* LINE Chat Dialog */}
        <Dialog open={!!lineDialog} onOpenChange={(open) => { if (!open) { setLineDialog(null); setLineMessage(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                แชท LINE - {lineDialog?.staffName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>ข้อความ</Label>
                <Textarea
                  value={lineMessage}
                  onChange={(e) => setLineMessage(e.target.value)}
                  rows={4}
                  placeholder="พิมพ์ข้อความหรือวางลิงก์เอกสาร..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLineMessage((prev) => prev + (prev ? "\n" : "") + window.location.origin + "/portal?view=staff-invoice&owner=" + user?.id)}
                >
                  📎 แนบลิงก์ฟอร์มเรียกเก็บ
                </Button>
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => lineDialog?.lineUserId && sendLineMutation.mutate({ lineUserId: lineDialog.lineUserId, message: lineMessage })}
                disabled={sendLineMutation.isPending || !lineMessage.trim()}
              >
                {sendLineMutation.isPending ? "กำลังส่ง..." : "ส่งข้อความ LINE"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pay with Slip Dialog */}
        <Dialog open={!!paySlipDialog} onOpenChange={(open) => { if (!open) resetPayDialog(); }}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                ยืนยันการจ่ายเงิน
              </DialogTitle>
            </DialogHeader>
            {paySlipDialog && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">{paySlipDialog.staff_profiles?.staff_name}</p>
                  <p className="text-muted-foreground">{paySlipDialog.event_name || "ไม่ระบุอีเวนท์"}</p>
                  <p className="text-primary font-bold text-lg">
                    {Number(paySlipDialog.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                  </p>
                </div>

                {/* Payment method selector */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">ช่องทางการจ่าย</Label>
                  <RadioGroup value={payMethod} onValueChange={(v) => setPayMethod(v as any)} className="grid grid-cols-3 gap-2">
                    <div>
                      <RadioGroupItem value="transfer" id="pm-transfer" className="peer sr-only" />
                      <Label
                        htmlFor="pm-transfer"
                        className="flex flex-col items-center gap-1 rounded-lg border-2 border-muted bg-popover p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <Upload className="h-5 w-5" />
                        <span className="text-xs">โอนเงิน</span>
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="cash" id="pm-cash" className="peer sr-only" />
                      <Label
                        htmlFor="pm-cash"
                        className="flex flex-col items-center gap-1 rounded-lg border-2 border-muted bg-popover p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <Banknote className="h-5 w-5" />
                        <span className="text-xs">เงินสด</span>
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="credit" id="pm-credit" className="peer sr-only" />
                      <Label
                        htmlFor="pm-credit"
                        className="flex flex-col items-center gap-1 rounded-lg border-2 border-muted bg-popover p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <CreditCard className="h-5 w-5" />
                        <span className="text-xs">เครดิต</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Transfer: upload slip */}
                {payMethod === "transfer" && (
                  <>
                    {/* Bank account info */}
                    {paySlipDialog.staff_profiles?.bank_account ? (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
                        <div className="text-xs font-semibold text-primary uppercase">ข้อมูลโอนเงิน</div>
                        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center text-sm">
                          <span className="text-muted-foreground">ธนาคาร</span>
                          <span className="font-medium">{paySlipDialog.staff_profiles?.bank_name || "-"}</span>
                          <span></span>

                          <span className="text-muted-foreground">ชื่อบัญชี</span>
                          <span className="font-medium truncate">{paySlipDialog.staff_profiles?.staff_name}</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(paySlipDialog.staff_profiles?.staff_name || "", "name")}>
                            {copiedField === "name" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>

                          <span className="text-muted-foreground">เลขบัญชี</span>
                          <span className="font-mono font-bold text-base">{paySlipDialog.staff_profiles?.bank_account}</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(String(paySlipDialog.staff_profiles?.bank_account || "").replace(/\D/g, ""), "acc")}>
                            {copiedField === "acc" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>

                          <span className="text-muted-foreground">ยอดโอน</span>
                          <span className="font-bold text-primary">{Number(paySlipDialog.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(Number(paySlipDialog.net_amount).toFixed(2), "amt")}>
                            {copiedField === "amt" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border-2 border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-warning">ทีมงานยังไม่ได้กรอกเลขบัญชี</p>
                          <p className="text-xs text-muted-foreground">ไปที่ทะเบียนทีมงาน เพื่อเพิ่มเลขบัญชี</p>
                        </div>
                      </div>
                    )}

                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">แนบสลิปเงินโอน</p>
                    <Button
                      variant="outline"
                      onClick={() => slipFileRef.current?.click()}
                      disabled={slipUploading}
                    >
                      {slipUploading ? "กำลังอัปโหลด..." : "เลือกไฟล์"}
                    </Button>
                    <input
                      ref={slipFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !paySlipDialog) return;
                        setSlipUploading(true);
                        triggerPayWithGuard({ invoice: paySlipDialog, paymentMethod: "transfer", slipFile: file })
                          .finally(() => setSlipUploading(false));
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-2">หรือส่งสลิปผ่าน LINE ระบบจะจับคู่อัตโนมัติ</p>
                  </div>
                  </>
                )}

                {/* Cash: confirmation with optional evidence */}
                {payMethod === "cash" && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 text-sm">
                      จ่ายเงินสด <span className="font-bold">{Number(paySlipDialog.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span> ให้ <span className="font-bold">{paySlipDialog.staff_profiles?.staff_name}</span>
                    </div>
                    <div>
                      <Label className="text-xs">หมายเหตุ (ไม่บังคับ)</Label>
                      <Textarea
                        placeholder="เช่น พี่เอจ่ายที่ออฟฟิศ / รับเงินที่หน้างาน"
                        value={cashNote}
                        onChange={(e) => setCashNote(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">แนบรูปใบรับเงิน/ลายเซ็น (ไม่บังคับ)</Label>
                      <div className="flex gap-2 items-center mt-1">
                        <input
                          ref={cashSlipRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => setCashSlipFile(e.target.files?.[0] || null)}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => cashSlipRef.current?.click()}>
                          <ImageIcon className="h-4 w-4 mr-1" />
                          {cashSlipFile ? "เปลี่ยนรูป" : "ถ่ายรูป / เลือกไฟล์"}
                        </Button>
                        {cashSlipFile && <span className="text-xs text-muted-foreground truncate flex-1">{cashSlipFile.name}</span>}
                      </div>
                    </div>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        if (!paySlipDialog) return;
                        if (cashSlipFile) setSlipUploading(true);
                        triggerPayWithGuard({
                          invoice: paySlipDialog,
                          paymentMethod: "cash",
                          slipFile: cashSlipFile || undefined,
                          extraNote: cashNote,
                        }).finally(() => setSlipUploading(false));
                      }}
                      disabled={markPaidMutation.isPending || slipUploading}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {markPaidMutation.isPending || slipUploading ? "กำลังบันทึก..." : "ยืนยันจ่ายเงินสดแล้ว"}
                    </Button>
                  </div>
                )}

                {/* Credit: due date + reason */}
                {payMethod === "credit" && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <span>บันทึกเป็น <b>เครดิต</b> = ยังไม่ตัดเงินสด/บัญชี ระบบจะถือเป็นเจ้าหนี้รอชำระ</span>
                    </div>
                    <div>
                      <Label className="text-xs">กำหนดชำระภายใน</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !creditDueDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {creditDueDate ? format(creditDueDate, "dd MMM yyyy") : "เลือกวันที่"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={creditDueDate}
                            onSelect={setCreditDueDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-xs">เหตุผล / หมายเหตุ</Label>
                      <Textarea
                        placeholder="เช่น รอสรุปงานก่อน / รอเงินเข้า"
                        value={creditNote}
                        onChange={(e) => setCreditNote(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (!paySlipDialog) return;
                        triggerPayWithGuard({
                          invoice: paySlipDialog,
                          paymentMethod: "credit",
                          extraNote: creditNote,
                          dueDate: creditDueDate ? format(creditDueDate, "yyyy-MM-dd") : undefined,
                        });
                      }}
                      disabled={markPaidMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {markPaidMutation.isPending ? "กำลังบันทึก..." : "บันทึกเป็นเครดิต"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Invoice Dialog */}
        <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                แก้ไขรายการ {editDialog?.invoice_number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>ทีมงาน *</Label>
                <Select value={editForm.staff_id} onValueChange={(v) => {
                  const staff = staffList.find((s) => s.id === v);
                  setEditForm((p) => ({ ...p, staff_id: v, daily_rate: staff ? Number(staff.daily_rate) : p.daily_rate }));
                }}>
                  <SelectTrigger><SelectValue placeholder="เลือกทีมงาน" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.staff_name} {s.nickname ? `(${s.nickname})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>อีเวนท์</Label>
                <Select value={editForm.event_name} onValueChange={(v) => setEditForm((p) => ({ ...p, event_name: v }))}>
                  <SelectTrigger><SelectValue placeholder="เลือกอีเวนท์ (ไม่บังคับ)" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.event_name}>{e.event_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>จำนวนวัน</Label>
                  <Input type="number" min={0.5} step={0.5} value={editForm.days_worked} onChange={(e) => setEditForm((p) => ({ ...p, days_worked: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>ค่าแรง/วัน</Label>
                  <Input type="number" min={0} value={editForm.daily_rate} onChange={(e) => setEditForm((p) => ({ ...p, daily_rate: Number(e.target.value) }))} />
                </div>
              </div>

              <div>
                <Label>โบนัส (บาท)</Label>
                <Input type="number" min={0} value={editForm.bonus_amount} onChange={(e) => setEditForm((p) => ({ ...p, bonus_amount: Number(e.target.value) }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>วันเริ่มงาน</Label>
                  <Input type="date" value={editForm.work_start_date} onChange={(e) => setEditForm((p) => ({ ...p, work_start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>วันสิ้นสุด</Label>
                  <Input type="date" value={editForm.work_end_date} onChange={(e) => setEditForm((p) => ({ ...p, work_end_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>โหมดคำนวณภาษี</Label>
                <RadioGroup value={editForm.wht_mode} onValueChange={(v) => setEditForm((p) => ({ ...p, wht_mode: v as any }))} className="flex flex-wrap gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="inclusive" id="wht-inc-edit" />
                    <Label htmlFor="wht-inc-edit" className="font-normal">รวมภาษีแล้ว</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="exclusive" id="wht-exc-edit" />
                    <Label htmlFor="wht-exc-edit" className="font-normal">ไม่รวมภาษี</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="wht-none-edit" />
                    <Label htmlFor="wht-none-edit" className="font-normal">ไม่หัก ณ ที่จ่าย</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Calculation preview */}
              {editForm.daily_rate > 0 && (() => {
                const base = editForm.days_worked * editForm.daily_rate + editForm.bonus_amount;
                const gross = editForm.wht_mode === "exclusive" ? Math.round(base / 0.97 * 100) / 100 : base;
                const wht = editForm.wht_mode === "none" ? 0 : Math.round(gross * 0.03 * 100) / 100;
                const net = gross - wht;
                return (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>Gross</span><span>{gross.toLocaleString()}</span>
                    </div>
                    {editForm.wht_mode !== "none" && (
                      <div className="flex justify-between text-destructive">
                        <span>หัก ณ ที่จ่าย 3%</span><span>-{wht.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-primary border-t pt-1">
                      <span>Net</span><span>{net.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <Label>หมายเหตุ</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>

              <Button className="w-full" onClick={() => editInvoiceMutation.mutate()} disabled={editInvoiceMutation.isPending || !editForm.staff_id}>
                {editInvoiceMutation.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default StaffPayments;
