import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Receipt, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useVendorProfiles } from "@/hooks/useVendorData";

interface AttachInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    amount: number;
    expense_date: string;
    description: string | null;
    merchant: string | null;
    receiver: string | null;
  } | null;
  onSuccess?: () => void;
}

type Step = "form" | "preview" | "saving";

export function AttachInvoiceDialog({ open, onOpenChange, expense, onSuccess }: AttachInvoiceDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: vendors = [] } = useVendorProfiles();

  const [step, setStep] = useState<Step>("form");
  const [vendorId, setVendorId] = useState<string>("");
  const [newVendorName, setNewVendorName] = useState("");
  const [docType, setDocType] = useState<"invoice" | "tax_invoice" | "receipt">("tax_invoice");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(expense?.expense_date ?? "");
  const [grossAmount, setGrossAmount] = useState<number>(0);
  const [vatAmount, setVatAmount] = useState<number>(0);
  const [whtAmount, setWhtAmount] = useState<number>(0);
  const [whtRate, setWhtRate] = useState<number>(3);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && expense) {
      setStep("form");
      setVendorId("");
      setNewVendorName(expense.receiver || expense.merchant || "");
      setDocType("tax_invoice");
      setInvoiceNumber("");
      setInvoiceDate(expense.expense_date);
      setGrossAmount(expense.amount);
      setVatAmount(0);
      setWhtAmount(0);
      setWhtRate(3);
      setNotes("");
      setFile(null);
    }
  }, [open, expense]);

  const netAmount = useMemo(() => grossAmount - whtAmount, [grossAmount, whtAmount]);
  const cashPaid = expense?.amount ?? 0;
  const cashMatchesNet = Math.abs(netAmount - cashPaid) <= 1;

  const computeWhtFromRate = (g: number, r: number) => Math.round(g * r * 100) / 10000;

  const handleWhtRateChange = (r: number) => {
    setWhtRate(r);
    setWhtAmount(computeWhtFromRate(grossAmount, r));
  };

  const handleGrossChange = (g: number) => {
    setGrossAmount(g);
    if (whtRate > 0) setWhtAmount(computeWhtFromRate(g, whtRate));
  };

  const proceedToPreview = () => {
    if (!vendorId && !newVendorName.trim()) {
      toast({ title: "ระบุคู่ค้า", description: "เลือกคู่ค้าที่มีอยู่ หรือกรอกชื่อใหม่", variant: "destructive" });
      return;
    }
    if (grossAmount <= 0) {
      toast({ title: "ยอดเงินไม่ถูกต้อง", variant: "destructive" });
      return;
    }
    setStep("preview");
  };

  const handleSave = async () => {
    if (!user || !expense) return;
    setSaving(true);
    try {
      // 1. Resolve vendor
      let resolvedVendorId = vendorId || null;
      if (!resolvedVendorId && newVendorName.trim()) {
        const { data: newVendor, error: vErr } = await supabase
          .from("vendor_profiles")
          .insert({
            user_id: user.id,
            company_name: newVendorName.trim(),
            vendor_type: "company",
            is_active: true,
          })
          .select("id")
          .single();
        if (vErr) throw vErr;
        resolvedVendorId = newVendor.id;
      }

      // 2. Upload file (optional)
      let fileUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const ts = Date.now();
        const path = `${user.id}/vendor-invoices/${ts}_${expense.id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        fileUrl = path;
      }

      // 3. Create vendor_invoice (matched to expense)
      const { data: invoice, error: invErr } = await supabase
        .from("vendor_invoices")
        .insert({
          user_id: user.id,
          vendor_id: resolvedVendorId,
          document_type: docType,
          invoice_number: invoiceNumber || null,
          invoice_date: invoiceDate || null,
          amount: grossAmount,
          vat_amount: vatAmount,
          wht_amount: whtAmount,
          net_amount: netAmount,
          file_url: fileUrl,
          matched_expense_id: expense.id,
          status: "approved",
          is_formal: docType !== "receipt",
          notes: notes || null,
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (invErr) throw invErr;

      // 4. If WHT > 0, adjust expense to Gross + create WHT liability + draft cert
      if (whtAmount > 0) {
        // Update original expense to Gross
        await supabase
          .from("expenses")
          .update({ amount: grossAmount, needs_review: false })
          .eq("id", expense.id);

        // Create WHT liability expense
        const { error: whtExpErr } = await supabase.from("expenses").insert({
          user_id: user.id,
          amount: whtAmount,
          expense_date: invoiceDate || expense.expense_date,
          category: "ภาษีหัก ณ ที่จ่าย",
          subcategory: `WHT ${whtRate}%`,
          category_group: "GENERAL",
          transaction_type: "BUSINESS",
          transaction_direction: "EXPENSE",
          description: `WHT ${whtRate}% — ${newVendorName || vendors.find(v => v.id === vendorId)?.company_name || ''} (บิล ${invoiceNumber || '-'})`,
          receiver: "กรมสรรพากร",
          merchant: "WHT Liability",
          needs_review: false,
          confidence_score: 100,
        });
        if (whtExpErr) throw whtExpErr;

        // Create WHT certificate (draft)
        const vendor = vendors.find(v => v.id === resolvedVendorId);
        const payeeName = vendor?.company_name || newVendorName.trim();
        const payeeTaxId = vendor?.tax_id || null;
        const payeeAddress = vendor?.address || null;
        const payeeType = vendor?.vendor_type === "individual" ? "individual" : "juristic";

        const { data: cert, error: certErr } = await supabase
          .from("wht_certificates")
          .insert({
            user_id: user.id,
            payee_name: payeeName,
            payee_tax_id: payeeTaxId,
            payee_address: payeeAddress,
            payee_type: payeeType,
            payee_source: "vendor_invoice",
            payee_source_id: resolvedVendorId,
            pnd_type: payeeType === "individual" ? "3" : "53",
            issue_date: invoiceDate || expense.expense_date,
            total_gross: grossAmount,
            total_tax: whtAmount,
            status: "draft",
            source_invoice_id: invoice.id,
            source_type: "vendor_invoice",
          })
          .select("id")
          .single();
        if (certErr) throw certErr;

        await supabase.from("wht_certificate_items").insert({
          certificate_id: cert.id,
          income_type_index: 2,
          income_type_label: "ค่าบริการ/ค่าจ้างทำของ",
          gross_amount: grossAmount,
          tax_rate: whtRate,
          tax_amount: whtAmount,
          payment_date: invoiceDate || expense.expense_date,
        });
      }

      toast({
        title: "แนบบิลและสร้างรายการ WHT สำเร็จ",
        description: whtAmount > 0
          ? `ปรับ expense → Gross ฿${grossAmount.toLocaleString()}, สร้าง WHT ฿${whtAmount.toLocaleString()}, draft cert พร้อมออก ภ.ง.ด.`
          : `แนบบิลสำเร็จ`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "เกิดข้อผิดพลาด", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            แนบบิล/ใบกำกับภาษี + จับคู่กับสลิปจ่าย
          </DialogTitle>
        </DialogHeader>

        <Card className="p-3 bg-muted/40 text-sm space-y-1">
          <div className="font-medium">รายการที่จ่ายแล้ว:</div>
          <div className="text-muted-foreground">
            {expense.expense_date} • ฿{expense.amount.toLocaleString()} • {expense.receiver || expense.merchant || expense.description}
          </div>
        </Card>

        {step === "form" && (
          <div className="space-y-3">
            <div>
              <Label>คู่ค้า *</Label>
              <select
                className="w-full h-10 px-3 rounded-md border bg-background"
                value={vendorId}
                onChange={(e) => { setVendorId(e.target.value); if (e.target.value) setNewVendorName(""); }}
              >
                <option value="">— เลือกคู่ค้าที่มีอยู่ —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.company_name}{v.tax_id ? ` (${v.tax_id})` : ""}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground mt-1">หรือกรอกชื่อคู่ค้าใหม่ด้านล่าง:</div>
              <Input
                value={newVendorName}
                onChange={(e) => { setNewVendorName(e.target.value); if (e.target.value) setVendorId(""); }}
                placeholder="ชื่อคู่ค้า/บริษัท..."
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ประเภทเอกสาร</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-background"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as "invoice" | "tax_invoice" | "receipt")}
                >
                  <option value="tax_invoice">ใบกำกับภาษี</option>
                  <option value="invoice">ใบวางบิล/Invoice</option>
                  <option value="receipt">ใบเสร็จรับเงิน</option>
                </select>
              </div>
              <div>
                <Label>เลขที่เอกสาร</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันที่เอกสาร</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <Label>ยอด Gross (ก่อนหัก WHT) *</Label>
                <Input type="number" step="0.01" value={grossAmount} onChange={(e) => handleGrossChange(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>VAT</Label>
                <Input type="number" step="0.01" value={vatAmount} onChange={(e) => setVatAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>WHT %</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-background"
                  value={whtRate}
                  onChange={(e) => handleWhtRateChange(parseFloat(e.target.value))}
                >
                  <option value="0">0% (ไม่หัก)</option>
                  <option value="1">1%</option>
                  <option value="2">2%</option>
                  <option value="3">3%</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                </select>
              </div>
              <div>
                <Label>ยอด WHT</Label>
                <Input type="number" step="0.01" value={whtAmount} onChange={(e) => setWhtAmount(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <Alert variant={cashMatchesNet ? "default" : "destructive"}>
              {cashMatchesNet ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertDescription>
                Net (Gross - WHT) = ฿{netAmount.toLocaleString()} — เทียบกับยอดที่จ่ายจริง ฿{cashPaid.toLocaleString()}
                {!cashMatchesNet && ` (ต่างกัน ฿${Math.abs(netAmount - cashPaid).toLocaleString()})`}
              </AlertDescription>
            </Alert>

            <div>
              <Label>แนบไฟล์เอกสาร (ภาพหรือ PDF)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>

            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-1 text-sm">
                <div className="font-semibold">ระบบจะดำเนินการดังนี้ — ยืนยันก่อนบันทึก:</div>
              </AlertDescription>
            </Alert>

            <Card className="p-3 space-y-2 text-sm">
              <div>✓ สร้างบิล/ใบกำกับภาษี (vendor_invoices) จับคู่กับ expense นี้</div>
              {whtAmount > 0 ? (
                <>
                  <div className="text-warning">⚠ ปรับยอด expense เดิม: ฿{cashPaid.toLocaleString()} → ฿{grossAmount.toLocaleString()} (Gross)</div>
                  <div className="text-warning">+ สร้าง expense ใหม่ "ภาษีหัก ณ ที่จ่าย {whtRate}%" จำนวน ฿{whtAmount.toLocaleString()}</div>
                  <div>+ สร้างหนังสือรับรอง WHT (status: draft) — รอออก ภ.ง.ด.{vendors.find(v => v.id === vendorId)?.vendor_type === "individual" ? "3" : "53"}</div>
                </>
              ) : (
                <div className="text-muted-foreground">ไม่มี WHT — ไม่แตะ expense เดิม</div>
              )}
            </Card>

            {whtAmount > 0 && !cashMatchesNet && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  ยอดที่จ่ายจริง (฿{cashPaid.toLocaleString()}) ไม่ตรงกับ Net (฿{netAmount.toLocaleString()}) — โปรดย้อนกลับไปตรวจสอบ
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
              <Button onClick={proceedToPreview}>ตรวจสอบก่อนบันทึก →</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("form")} disabled={saving}>← ย้อนกลับ</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
