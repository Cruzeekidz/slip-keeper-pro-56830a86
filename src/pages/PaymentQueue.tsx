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
import { ArrowLeft, Copy, Check, Banknote, Upload, ImageIcon, CreditCard, Building2, Receipt, CheckCircle2, XCircle, FileText, Pencil, Send, Search } from "lucide-react";
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
  const [rejectInvoice, setRejectInvoice] = useState<{ id: string; staff_name: string; amount: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "staff" | "claim" | "vendor">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");
  const [search, setSearch] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sending, setSending] = useState<string | null>(null);

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
        .select("id, staff_id, amount, description, category, expense_date, event_name, receipt_url, status, staff_profiles(staff_name, nickname)")
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
        .select("id, invoice_number, description, amount, net_amount, wht_amount, file_url, status, vendor_id, link_type, invoice_date, due_date, vendor_profiles(company_name, bank_name, bank_account)")
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
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      toast({ title: action === "approve" ? "อนุมัติบิลคู่ค้าแล้ว" : action === "paid" ? "บันทึกว่าจ่ายแล้ว" : "ปฏิเสธบิลแล้ว" });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const openVendorBillFile = async (path: string | null) => {
    if (!path) return;
    let signed = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) {
      signed = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    }
    if (signed.data?.signedUrl) window.open(signed.data.signedUrl, "_blank");
    else toast({ title: "เปิดไฟล์ไม่ได้", variant: "destructive" });
  };

  const claimActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error } = await supabase.from("staff_expense_claims").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue-claims"] });
      queryClient.invalidateQueries({ queryKey: ["staff-reimbursement-claims"] });
      setRejectClaim(null);
      toast({ title: action === "approve" ? "อนุมัติใบเบิกแล้ว" : "ปฏิเสธใบเบิกแล้ว" });
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
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Summary */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">สรุปรวม</p>
              <Badge variant="secondary">{pendingInvoices.length} รายการ</Badge>
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

        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
        ) : pendingInvoices.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">ไม่มีรายการรอจ่ายเงิน</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingInvoices.map((inv) => {
              const grossAmount = Number(inv.gross_amount);
              const whtAmount = Number(inv.wht_amount);
              const netAmount = Number(inv.net_amount);
              const cleanAcct = cleanAccountNumber(inv.staff_profiles?.bank_account);

              return (
                <Card key={inv.id}>
                  <CardContent className="pt-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {inv.staff_profiles?.staff_name}
                          {inv.staff_profiles?.nickname && (
                            <span className="text-muted-foreground font-normal text-sm ml-1">({inv.staff_profiles.nickname})</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {inv.event_name || "ไม่ระบุอีเวนท์"} • {inv.invoice_number}
                        </p>
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
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-500" />
                ใบเบิกค่าใช้จ่ายทีมงาน
              </p>
              <Badge variant="secondary">{pendingClaims.length} รายการ</Badge>
            </div>
            {pendingClaims.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">ไม่มีใบเบิกค้างอยู่</p>
            ) : (
              <div className="space-y-2">
                {pendingClaims.map((c) => (
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
                        <Button size="sm" onClick={() => navigate("/staff-payments?tab=reimbursement")}>
                          <Banknote className="h-3 w-3 mr-1" />จ่ายคืน
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendor invoices / bills */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                บิลคู่ค้า / ใบแจ้งหนี้รอจ่าย
              </p>
              <Badge variant="secondary">{pendingVendorBills.length} รายการ</Badge>
            </div>
            {pendingVendorBills.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">ไม่มีบิลคู่ค้าค้างจ่าย</p>
            ) : (
              <div className="space-y-2">
                {pendingVendorBills.map((b) => {
                  const net = Number(b.net_amount || b.amount || 0);
                  const acct = b.vendor_profiles?.bank_account?.replace(/[-\s]/g, "");
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{b.vendor_profiles?.company_name || "ยังไม่ผูกคู่ค้า"}</span>
                          <Badge variant={b.status === "approved" ? "default" : "secondary"} className="text-[10px]">
                            {b.status === "approved" ? "อนุมัติแล้ว · รอจ่าย" : "รออนุมัติ"}
                          </Badge>
                          {b.invoice_number && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{b.invoice_number}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{b.description || "—"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span className="font-semibold text-foreground">{net.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                          {b.invoice_date && <span>· {b.invoice_date}</span>}
                          {b.due_date && <span>· ครบกำหนด {b.due_date}</span>}
                          {acct && (
                            <span className="font-mono">· {b.vendor_profiles?.bank_name} {acct}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {b.file_url && (
                          <Button size="icon" variant="ghost" onClick={() => openVendorBillFile(b.file_url)} title="ดูบิล">
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {acct && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="คัดลอกเลขบัญชี"
                            onClick={() => {
                              navigator.clipboard.writeText(acct);
                              toast({ title: "คัดลอกเลขบัญชีแล้ว", description: acct });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {b.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "approve" })}
                              disabled={vendorBillActionMutation.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "reject" })}
                            >
                              <XCircle className="h-3 w-3 mr-1" />ปฏิเสธ
                            </Button>
                          </>
                        )}
                        {b.status === "approved" && (
                          <Button
                            size="sm"
                            onClick={() => vendorBillActionMutation.mutate({ id: b.id, action: "paid" })}
                            disabled={vendorBillActionMutation.isPending}
                          >
                            <Banknote className="h-3 w-3 mr-1" />จ่ายแล้ว
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
    </div>
  );
};

export default PaymentQueue;
