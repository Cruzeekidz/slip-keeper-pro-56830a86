import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link2, Receipt, Wallet, FileText, ExternalLink, CheckCircle2, AlertCircle, X, Building2, Copy, Upload, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { buildUploadPath } from "@/lib/storage-path";
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

const CLAIM_STATUS_LABELS: Record<string, string> = {
  submitted: "ส่งแล้ว",
  approved: "อนุมัติแล้ว",
  reimbursed: "จ่ายคืนแล้ว",
};

const CLAIM_STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  submitted: "secondary",
  approved: "default",
  reimbursed: "outline",
};

const REIMBURSE_CATEGORIES = [
  "ค่าเดินทาง/น้ำมัน",
  "ค่าทางด่วน",
  "ค่าอุปกรณ์",
  "ค่าอาหาร",
  "ค่าที่พัก",
  "ค่าวัสดุ",
  "อื่นๆ",
];

interface VendorInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number;
  description: string | null;
  file_url: string | null;
  vendor_id: string | null;
  link_type: string;
  linked_staff_id: string | null;
  created_at: string;
}

interface StaffClaim {
  id: string;
  staff_id: string;
  amount: number;
  description: string;
  category: string;
  expense_date: string | null;
  event_name: string | null;
  receipt_url: string | null;
  vendor_invoice_id: string | null;
  status: string;
  reimbursed_at: string | null;
  reimbursed_expense_id: string | null;
  notes: string | null;
  staff_profiles?: {
    staff_name: string;
    nickname: string | null;
    bank_name?: string | null;
    bank_account?: string | null;
  } | null;
}

const StaffReimbursementTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [linkBillDialog, setLinkBillDialog] = useState<VendorInvoice | null>(null);
  const [linkForm, setLinkForm] = useState<{
    staff_id: string;
    mode: "new" | "existing";
    existing_claim_id: string;
    category: string;
    event_name: string;
    notes: string;
  }>({
    staff_id: "",
    mode: "new",
    existing_claim_id: "",
    category: "ค่าเดินทาง/น้ำมัน",
    event_name: "",
    notes: "",
  });

  const [reimburseDialog, setReimburseDialog] = useState<StaffClaim | null>(null);
  const [reimburseForm, setReimburseForm] = useState({
    paid_date: new Date().toISOString().split("T")[0],
    payment_method: "transfer" as "transfer" | "cash",
    notes: "",
  });
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [linkExpenseId, setLinkExpenseId] = useState<string>("");
  const [copiedField, setCopiedField] = useState<string>("");
  const slipInputRef = useRef<HTMLInputElement>(null);

  // Move-to-vendor (link with vendor) dialog state
  const [vendorLinkDialog, setVendorLinkDialog] = useState<VendorInvoice | null>(null);
  const [vendorLinkId, setVendorLinkId] = useState<string>("");
  const [confirmNotStaff, setConfirmNotStaff] = useState<VendorInvoice | null>(null);

  const { data: unlinkedBills = [] } = useQuery({
    queryKey: ["unlinked-vendor-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("id, invoice_number, invoice_date, amount, description, file_url, vendor_id, link_type, linked_staff_id, created_at")
        .is("vendor_id", null)
        .is("linked_staff_id", null)
        .neq("link_type", "vendor_only")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorInvoice[];
    },
    enabled: !!user,
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-profiles-active-reimburse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, staff_name, nickname")
        .eq("is_active", true)
        .order("staff_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: vendorList = [] } = useQuery({
    queryKey: ["vendor-profiles-active-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("id, company_name")
        .eq("is_active", true)
        .order("company_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const linkToVendorMutation = useMutation({
    mutationFn: async ({ billId, vendorId }: { billId: string; vendorId: string }) => {
      const { error } = await supabase
        .from("vendor_invoices")
        .update({ vendor_id: vendorId, link_type: "vendor" })
        .eq("id", billId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unlinked-vendor-bills"] });
      qc.invalidateQueries({ queryKey: ["vendor-invoices"] });
      setVendorLinkDialog(null);
      setVendorLinkId("");
      toast({ title: "ผูกบิลกับคู่ค้าสำเร็จ" });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const moveToVendorOnlyMutation = useMutation({
    mutationFn: async (billId: string) => {
      const { error } = await supabase
        .from("vendor_invoices")
        .update({ link_type: "vendor_only" })
        .eq("id", billId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unlinked-vendor-bills"] });
      setConfirmNotStaff(null);
      toast({ title: "ย้ายไปยังบิลคู่ค้าแล้ว", description: "ไปจัดการที่หน้า 'คู่ค้า'" });
    },
    onError: (err: any) => toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const { data: claims = [] } = useQuery({
    queryKey: ["staff-reimbursement-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_expense_claims")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as StaffClaim[];
    },
    enabled: !!user,
  });

  const { data: candidateClaims = [] } = useQuery({
    queryKey: ["staff-claims-without-bill", linkForm.staff_id],
    queryFn: async () => {
      if (!linkForm.staff_id) return [];
      const { data, error } = await supabase
        .from("staff_expense_claims")
        .select("id, amount, description, expense_date, event_name, status")
        .eq("staff_id", linkForm.staff_id)
        .is("vendor_invoice_id", null)
        .neq("status", "reimbursed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!linkForm.staff_id && !!linkBillDialog,
  });

  const openLinkDialog = (bill: VendorInvoice) => {
    setLinkBillDialog(bill);
    setLinkForm({
      staff_id: "",
      mode: "new",
      existing_claim_id: "",
      category: "ค่าเดินทาง/น้ำมัน",
      event_name: "",
      notes: bill.description || "",
    });
  };

  const linkBillMutation = useMutation({
    mutationFn: async () => {
      if (!user || !linkBillDialog) throw new Error("ไม่พบข้อมูล");
      if (!linkForm.staff_id) throw new Error("กรุณาเลือกทีมงาน");

      let claimId = linkForm.existing_claim_id;

      if (linkForm.mode === "new") {
        const { data: newClaim, error: insErr } = await supabase
          .from("staff_expense_claims")
          .insert({
            user_id: user.id,
            staff_id: linkForm.staff_id,
            amount: Number(linkBillDialog.amount),
            description: linkBillDialog.description || `บิล ${linkBillDialog.invoice_number || ""}`.trim(),
            category: linkForm.category,
            event_name: linkForm.event_name || null,
            expense_date: linkBillDialog.invoice_date,
            receipt_url: linkBillDialog.file_url,
            has_formal_receipt: true,
            vendor_invoice_id: linkBillDialog.id,
            status: "approved",
            notes: linkForm.notes || null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        claimId = newClaim.id;
      } else {
        if (!claimId) throw new Error("กรุณาเลือกใบเบิกที่มีอยู่");
        const { error: updErr } = await supabase
          .from("staff_expense_claims")
          .update({
            vendor_invoice_id: linkBillDialog.id,
            receipt_url: linkBillDialog.file_url,
            has_formal_receipt: true,
          })
          .eq("id", claimId);
        if (updErr) throw updErr;
      }

      const { error: vErr } = await supabase
        .from("vendor_invoices")
        .update({
          link_type: "staff_reimbursement",
          linked_staff_id: linkForm.staff_id,
        })
        .eq("id", linkBillDialog.id);
      if (vErr) throw vErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unlinked-vendor-bills"] });
      qc.invalidateQueries({ queryKey: ["staff-reimbursement-claims"] });
      setLinkBillDialog(null);
      toast({ title: "ผูกบิลกับใบเบิกสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const reimburseMutation = useMutation({
    mutationFn: async () => {
      if (!user || !reimburseDialog) throw new Error("ไม่พบข้อมูล");

      const claim = reimburseDialog;
      const staffName = claim.staff_profiles?.staff_name || "";

      // ★ Mode A: Link to existing expense (slip already in system, e.g. from LINE)
      if (linkExpenseId) {
        const { data: existingExp, error: fetchErr } = await supabase
          .from("expenses")
          .select("id, receipt_url, expense_date")
          .eq("id", linkExpenseId)
          .single();
        if (fetchErr) throw fetchErr;

        const { error: clErr } = await supabase
          .from("staff_expense_claims")
          .update({
            status: "reimbursed",
            reimbursed_at: new Date().toISOString(),
            reimbursed_expense_id: existingExp.id,
          })
          .eq("id", claim.id);
        if (clErr) throw clErr;

        if (claim.vendor_invoice_id) {
          await supabase
            .from("vendor_invoices")
            .update({
              status: "paid",
              paid_at: existingExp.expense_date
                ? new Date(existingExp.expense_date).toISOString()
                : new Date().toISOString(),
              matched_expense_id: existingExp.id,
              payment_slip_url: existingExp.receipt_url || null,
            })
            .eq("id", claim.vendor_invoice_id);
        }
        return;
      }

      // ★ Mode B: New expense, with optional uploaded slip
      let slipPath: string | null = null;
      if (slipFile) {
        const ext = slipFile.name.split(".").pop() || "jpg";
        const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_reimburse_${claim.id}.${ext}`);
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, slipFile, { contentType: slipFile.type, upsert: false });
        if (upErr) throw upErr;
        slipPath = path;
      }

      const { data: exp, error: expErr } = await supabase
        .from("expenses")
        .insert({
          user_id: user.id,
          amount: Number(claim.amount),
          category: claim.category,
          subcategory: "เบิกคืนทีมงาน",
          category_group: "EVENT",
          transaction_type: "BUSINESS",
          transaction_direction: "EXPENSE",
          description: `เบิกคืน ${staffName} — ${claim.description}`,
          expense_date: reimburseForm.paid_date,
          staff_name: staffName,
          event_name: claim.event_name,
          receiver: staffName,
          memo_text: `จ่ายคืนค่าใช้จ่ายสำรอง (${reimburseForm.payment_method === "cash" ? "เงินสด" : "โอน"})${reimburseForm.notes ? ` - ${reimburseForm.notes}` : ""}`,
          receipt_url: slipPath || claim.receipt_url,
        })
        .select("id")
        .single();
      if (expErr) throw expErr;

      const { error: clErr } = await supabase
        .from("staff_expense_claims")
        .update({
          status: "reimbursed",
          reimbursed_at: new Date().toISOString(),
          reimbursed_expense_id: exp.id,
        })
        .eq("id", claim.id);
      if (clErr) throw clErr;

      if (claim.vendor_invoice_id) {
        await supabase
          .from("vendor_invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            matched_expense_id: exp.id,
            payment_slip_url: slipPath || null,
          })
          .eq("id", claim.vendor_invoice_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-reimbursement-claims"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setReimburseDialog(null);
      setSlipFile(null);
      setLinkExpenseId("");
      toast({ title: "บันทึกการจ่ายคืนสำเร็จ", description: "สร้างรายการ expense แล้ว" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const openBillFile = async (path: string | null) => {
    if (!path) return;
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const submittedClaims = claims.filter((c) => c.status === "submitted");
  const approvedClaims = claims.filter((c) => c.status === "approved");
  const reimbursedClaims = claims.filter((c) => c.status === "reimbursed");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            บิลรอผูกกับทีมงาน ({unlinkedBills.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {unlinkedBills.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">ไม่มีบิลรอผูก ✓</p>
          ) : (
            unlinkedBills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-2 p-3 border rounded-md hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{bill.invoice_number || "—"}</span>
                    <span className="font-semibold">{Number(bill.amount).toLocaleString()} ฿</span>
                    {bill.invoice_date && <span className="text-xs text-muted-foreground">{bill.invoice_date}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{bill.description || "—"}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {bill.file_url && (
                    <Button size="icon" variant="ghost" onClick={() => openBillFile(bill.file_url)} title="ดูบิล">
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openLinkDialog(bill)}>
                    <Link2 className="h-3 w-3 mr-1" />ผูก
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="ผูกกับคู่ค้าทันที"
                    onClick={() => { setVendorLinkId(""); setVendorLinkDialog(bill); }}
                  >
                    <Building2 className="h-3 w-3 mr-1" />ผูกกับคู่ค้า
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="ไม่ใช่บิลทีมงาน — ย้ายไปคู่ค้า"
                    onClick={() => setConfirmNotStaff(bill)}
                  >
                    <X className="h-3 w-3 mr-1" />ไม่ใช่ทีมงาน
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {[
        { title: "รออนุมัติ", list: submittedClaims, color: "text-blue-500" },
        { title: "พร้อมจ่ายคืน", list: approvedClaims, color: "text-amber-500" },
        { title: "จ่ายคืนแล้ว", list: reimbursedClaims, color: "text-green-500" },
      ].map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-base flex items-center gap-2 ${section.color}`}>
              <Receipt className="h-4 w-4" />
              {section.title} ({section.list.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {section.list.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">ไม่มีรายการ</p>
            ) : (
              section.list.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.staff_profiles?.staff_name}</span>
                      {c.staff_profiles?.nickname && <span className="text-xs text-muted-foreground">({c.staff_profiles.nickname})</span>}
                      <Badge variant={CLAIM_STATUS_COLORS[c.status]} className="text-[10px]">{CLAIM_STATUS_LABELS[c.status]}</Badge>
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
                      <Button size="icon" variant="ghost" onClick={() => openBillFile(c.receipt_url)} title="ดูใบเสร็จ">
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {c.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await supabase.from("staff_expense_claims").update({ status: "approved" }).eq("id", c.id);
                          qc.invalidateQueries({ queryKey: ["staff-reimbursement-claims"] });
                          toast({ title: "อนุมัติแล้ว" });
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />อนุมัติ
                      </Button>
                    )}
                    {c.status === "approved" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setReimburseForm({ paid_date: new Date().toISOString().split("T")[0], payment_method: "transfer", notes: "" });
                          setReimburseDialog(c);
                        }}
                      >
                        <Wallet className="h-3 w-3 mr-1" />จ่ายคืน
                      </Button>
                    )}
                    {c.status === "reimbursed" && c.reimbursed_expense_id && (
                      <Button size="icon" variant="ghost" onClick={() => window.open(`/?edit=${c.reimbursed_expense_id}`, "_blank")} title="ดู expense">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!linkBillDialog} onOpenChange={(o) => !o && setLinkBillDialog(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ผูกบิลกับใบเบิกพนักงาน</DialogTitle>
          </DialogHeader>
          {linkBillDialog && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/40 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">บิล:</span><span className="font-mono">{linkBillDialog.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ยอด:</span><span className="font-semibold">{Number(linkBillDialog.amount).toLocaleString()} ฿</span></div>
                <p className="text-xs text-muted-foreground mt-1">{linkBillDialog.description}</p>
              </div>

              <div>
                <Label>ทีมงานผู้สำรองจ่าย *</Label>
                <Select value={linkForm.staff_id} onValueChange={(v) => setLinkForm((p) => ({ ...p, staff_id: v, existing_claim_id: "" }))}>
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

              {linkForm.staff_id && (
                <div className="space-y-2">
                  <Label>โหมด</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={linkForm.mode === "new" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLinkForm((p) => ({ ...p, mode: "new" }))}
                    >สร้างใบเบิกใหม่</Button>
                    <Button
                      type="button"
                      variant={linkForm.mode === "existing" ? "default" : "outline"}
                      size="sm"
                      disabled={candidateClaims.length === 0}
                      onClick={() => setLinkForm((p) => ({ ...p, mode: "existing" }))}
                    >เลือกที่มีอยู่ ({candidateClaims.length})</Button>
                  </div>
                </div>
              )}

              {linkForm.mode === "existing" && (
                <div>
                  <Label>เลือกใบเบิก</Label>
                  <Select value={linkForm.existing_claim_id} onValueChange={(v) => setLinkForm((p) => ({ ...p, existing_claim_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="เลือกใบเบิก" /></SelectTrigger>
                    <SelectContent>
                      {candidateClaims.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {Number(c.amount).toLocaleString()}฿ — {c.description.slice(0, 30)} {c.expense_date ? `(${c.expense_date})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {linkForm.mode === "new" && (
                <>
                  <div>
                    <Label>หมวดหมู่</Label>
                    <Select value={linkForm.category} onValueChange={(v) => setLinkForm((p) => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REIMBURSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>อีเวนท์ที่เกี่ยวข้อง</Label>
                    <Input value={linkForm.event_name} onChange={(e) => setLinkForm((p) => ({ ...p, event_name: e.target.value }))} placeholder="ไม่บังคับ" />
                  </div>
                  <div>
                    <Label>หมายเหตุ</Label>
                    <Textarea value={linkForm.notes} onChange={(e) => setLinkForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkBillDialog(null)}>ยกเลิก</Button>
            <Button onClick={() => linkBillMutation.mutate()} disabled={linkBillMutation.isPending}>
              {linkBillMutation.isPending ? "กำลังบันทึก..." : "ผูกบิล"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reimburseDialog} onOpenChange={(o) => !o && setReimburseDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>จ่ายคืนค่าใช้จ่ายให้ทีมงาน</DialogTitle>
          </DialogHeader>
          {reimburseDialog && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/40 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">ทีมงาน:</span><span className="font-semibold">{reimburseDialog.staff_profiles?.staff_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ยอด:</span><span className="font-semibold text-primary">{Number(reimburseDialog.amount).toLocaleString()} ฿</span></div>
                <div className="text-xs text-muted-foreground">{reimburseDialog.description}</div>
              </div>
              <div>
                <Label>วันที่จ่ายคืน *</Label>
                <Input type="date" value={reimburseForm.paid_date} onChange={(e) => setReimburseForm((p) => ({ ...p, paid_date: e.target.value }))} />
              </div>
              <div>
                <Label>วิธีจ่าย</Label>
                <Select value={reimburseForm.payment_method} onValueChange={(v: any) => setReimburseForm((p) => ({ ...p, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">โอนเงิน</SelectItem>
                    <SelectItem value="cash">เงินสด</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>หมายเหตุ</Label>
                <Textarea value={reimburseForm.notes} onChange={(e) => setReimburseForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="เลขสลิป ฯลฯ" />
              </div>
              <div className="text-xs text-muted-foreground p-2 bg-amber-500/10 rounded border border-amber-500/30">
                ⚠️ ระบบจะสร้างรายการ expense (BUSINESS / EVENT) อัตโนมัติ
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReimburseDialog(null)}>ยกเลิก</Button>
            <Button onClick={() => reimburseMutation.mutate()} disabled={reimburseMutation.isPending}>
              {reimburseMutation.isPending ? "กำลังบันทึก..." : "ยืนยันจ่ายคืน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link bill to vendor dialog */}
      <Dialog open={!!vendorLinkDialog} onOpenChange={(o) => { if (!o) { setVendorLinkDialog(null); setVendorLinkId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ผูกบิลกับคู่ค้า</DialogTitle>
          </DialogHeader>
          {vendorLinkDialog && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/40 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">บิล:</span><span className="font-mono">{vendorLinkDialog.invoice_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ยอด:</span><span className="font-semibold">{Number(vendorLinkDialog.amount).toLocaleString()} ฿</span></div>
                <p className="text-xs text-muted-foreground mt-1">{vendorLinkDialog.description}</p>
              </div>
              <div>
                <Label>เลือกคู่ค้า *</Label>
                <Select value={vendorLinkId} onValueChange={setVendorLinkId}>
                  <SelectTrigger><SelectValue placeholder="เลือกคู่ค้า" /></SelectTrigger>
                  <SelectContent>
                    {vendorList.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">บิลจะถูกย้ายไปอยู่ภายใต้คู่ค้าที่เลือก และซ่อนจากแท็บนี้</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVendorLinkDialog(null); setVendorLinkId(""); }}>ยกเลิก</Button>
            <Button
              disabled={!vendorLinkId || linkToVendorMutation.isPending}
              onClick={() => vendorLinkDialog && linkToVendorMutation.mutate({ billId: vendorLinkDialog.id, vendorId: vendorLinkId })}
            >
              {linkToVendorMutation.isPending ? "กำลังบันทึก..." : "ยืนยันผูกคู่ค้า"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm move to vendor-only */}
      <AlertDialog open={!!confirmNotStaff} onOpenChange={(o) => !o && setConfirmNotStaff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันย้ายบิลออกจากใบเบิกทีมงาน</AlertDialogTitle>
            <AlertDialogDescription>
              บิล <span className="font-mono">{confirmNotStaff?.invoice_number || "—"}</span> ยอด{" "}
              <span className="font-semibold">{confirmNotStaff && Number(confirmNotStaff.amount).toLocaleString()} ฿</span><br />
              ไม่ใช่บิลที่ทีมงานสำรองจ่ายใช่ไหม? ระบบจะซ่อนจากแท็บนี้ และคุณสามารถไปผูกกับคู่ค้าได้ที่หน้า "คู่ค้า"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmNotStaff && moveToVendorOnlyMutation.mutate(confirmNotStaff.id)}>
              ยืนยัน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StaffReimbursementTab;
