import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, FileText, Save, X } from "lucide-react";
import { numberToThaiText } from "@/lib/thai-baht-text";
import { INCOME_TYPES, PND_TYPES, PAYER_CONDITION_OPTIONS, type IncomeTypeOption } from "@/lib/wht-constants";
import companyStampUrl from "@/assets/company-stamp.png";

const DEFAULT_PAYER = {
  name: "บริษัท เม้งซินเทรดดิ้ง จำกัด (สำนักงานใหญ่)",
  taxId: "0745556003673",
  address: "98/11 หมู่ 5 ต.พันท้ายนรสิงห์ อ.เมืองสมุทรสาคร จ.สมุทรสาคร 74000",
};

interface LineItem {
  id: string;
  incomeTypeIndex: number;
  paymentDate: string;
  grossAmount: number;
  taxRate: number;
  taxAmount: number;
}

interface PayeeOption {
  id: string;
  name: string;
  taxId: string;
  address: string;
  type: "individual" | "company";
  source: "staff" | "vendor";
}

const createLineItem = (overrides?: Partial<LineItem>): LineItem => ({
  id: crypto.randomUUID(),
  incomeTypeIndex: 2,
  paymentDate: new Date().toISOString().split("T")[0],
  grossAmount: 0,
  taxRate: 3,
  taxAmount: 0,
  ...overrides,
});

const WhtCertificateForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Document info
  const [docNumber, setDocNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);

  // Payer info
  const [payer, setPayer] = useState(DEFAULT_PAYER);

  // Payee info
  const [payeeSearch, setPayeeSearch] = useState("");
  const [payeeOptions, setPayeeOptions] = useState<PayeeOption[]>([]);
  const [selectedPayee, setSelectedPayee] = useState<PayeeOption | null>(null);
  const [isNewPayee, setIsNewPayee] = useState(false);
  const [newPayee, setNewPayee] = useState({ name: "", taxId: "", address: "", type: "individual" as "individual" | "company" });

  // PND type & condition
  const [pndType, setPndType] = useState("3");
  const [payerCondition, setPayerCondition] = useState("deducted");

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem()]);

  // Load payer from localStorage (override defaults if saved)
  useEffect(() => {
    const saved = localStorage.getItem("wht_payer_info");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.name) setPayer({ name: parsed.name, taxId: parsed.taxId || parsed.tax_id || DEFAULT_PAYER.taxId, address: parsed.address || DEFAULT_PAYER.address });
    }
  }, []);

  // Load payee options
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [staffRes, vendorRes] = await Promise.all([
        supabase.from("staff_profiles").select("id, staff_name, tax_id, address").eq("user_id", user.id).eq("is_active", true),
        supabase.from("vendor_profiles").select("id, company_name, tax_id, address, vendor_type").eq("user_id", user.id).eq("is_active", true),
      ]);
      const opts: PayeeOption[] = [];
      for (const s of staffRes.data || []) {
        opts.push({ id: s.id, name: s.staff_name, taxId: s.tax_id || "", address: s.address || "", type: "individual", source: "staff" });
      }
      for (const v of vendorRes.data || []) {
        opts.push({ id: v.id, name: v.company_name, taxId: v.tax_id || "", address: v.address || "", type: v.vendor_type === "company" ? "company" : "individual", source: "vendor" });
      }
      setPayeeOptions(opts);

      // Prefill from URL params (from WhtReport)
      const prefillPayee = searchParams.get("payee_name");
      if (prefillPayee) {
        const matched = opts.find(o => o.name === prefillPayee);
        if (matched) {
          selectPayee(matched);
        } else {
          setIsNewPayee(true);
          setNewPayee({
            name: prefillPayee,
            taxId: searchParams.get("payee_tax_id") || "",
            address: searchParams.get("payee_address") || "",
            type: (searchParams.get("payee_type") as "individual" | "company") || "individual",
          });
          setPndType(searchParams.get("pnd_type") || "3");
        }

        // Prefill line item
        const grossStr = searchParams.get("gross_amount");
        const whtStr = searchParams.get("wht_amount");
        const rateStr = searchParams.get("wht_rate");
        const paidDate = searchParams.get("paid_date");
        if (grossStr) {
          const gross = Number(grossStr);
          const wht = Number(whtStr || "0");
          const rate = Number(rateStr || "3");
          setLineItems([createLineItem({
            grossAmount: gross,
            taxRate: rate,
            taxAmount: wht > 0 ? wht : Math.round(gross * rate / 100 * 100) / 100,
            paymentDate: paidDate || new Date().toISOString().split("T")[0],
          })]);
        }

        const pndParam = searchParams.get("pnd_type");
        if (pndParam) setPndType(pndParam);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/auth");
  }, [user, authLoading]);

  const filteredPayees = useMemo(() => {
    if (!payeeSearch) return payeeOptions;
    const q = payeeSearch.toLowerCase();
    return payeeOptions.filter(p => p.name.toLowerCase().includes(q) || p.taxId.includes(q));
  }, [payeeOptions, payeeSearch]);

  const selectPayee = (p: PayeeOption) => {
    setSelectedPayee(p);
    setIsNewPayee(false);
    setPayeeSearch("");
    setPndType(p.type === "company" ? "53" : "3");
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "incomeTypeIndex") {
        const incomeType = INCOME_TYPES[value as number];
        updated.taxRate = incomeType.rate;
        updated.taxAmount = Math.round(updated.grossAmount * incomeType.rate / 100 * 100) / 100;
      }
      if (field === "grossAmount") {
        updated.taxAmount = Math.round((value as number) * updated.taxRate / 100 * 100) / 100;
      }
      if (field === "taxRate") {
        updated.taxAmount = Math.round(updated.grossAmount * (value as number) / 100 * 100) / 100;
      }
      return updated;
    }));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(i => i.id !== id));
  };

  const totalGross = lineItems.reduce((s, i) => s + i.grossAmount, 0);
  const totalTax = lineItems.reduce((s, i) => s + i.taxAmount, 0);

  const getPayeeInfo = () => {
    if (selectedPayee) return { name: selectedPayee.name, taxId: selectedPayee.taxId, address: selectedPayee.address, type: selectedPayee.type, source: selectedPayee.source, sourceId: selectedPayee.id };
    if (isNewPayee && newPayee.name) return { name: newPayee.name, taxId: newPayee.taxId, address: newPayee.address, type: newPayee.type, source: null, sourceId: null };
    return null;
  };

  const saveCertificate = async (andGenerate = false) => {
    if (!user) return;
    const payeeInfo = getPayeeInfo();
    if (!payeeInfo) {
      toast({ title: "กรุณาเลือกผู้ถูกหักภาษี", variant: "destructive" });
      return;
    }
    if (totalGross <= 0) {
      toast({ title: "กรุณากรอกจำนวนเงิน", variant: "destructive" });
      return;
    }

    setSaving(true);
    // Save payer to localStorage
    localStorage.setItem("wht_payer_info", JSON.stringify(payer));

    try {
      // Insert certificate
      const { data: cert, error: certError } = await supabase.from("wht_certificates").insert({
        user_id: user.id,
        doc_number: docNumber || null,
        issue_date: issueDate,
        pnd_type: pndType,
        payer_condition: payerCondition,
        payer_name: payer.name,
        payer_tax_id: payer.taxId,
        payer_address: payer.address,
        payee_name: payeeInfo.name,
        payee_tax_id: payeeInfo.taxId,
        payee_address: payeeInfo.address,
        payee_type: payeeInfo.type,
        payee_source: payeeInfo.source,
        payee_source_id: payeeInfo.sourceId,
        total_gross: totalGross,
        total_tax: totalTax,
        total_tax_text: numberToThaiText(totalTax),
        source_invoice_id: searchParams.get("source_id") || null,
        source_type: searchParams.get("source_type") || null,
        status: andGenerate ? "completed" : "draft",
      } as any).select().single();

      if (certError) throw certError;

      // Insert line items
      const items = lineItems.map(item => ({
        certificate_id: cert.id,
        income_type_index: item.incomeTypeIndex,
        income_type_label: INCOME_TYPES[item.incomeTypeIndex]?.label || "",
        payment_date: item.paymentDate,
        gross_amount: item.grossAmount,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
      }));

      const { error: itemsError } = await supabase.from("wht_certificate_items").insert(items as any);
      if (itemsError) throw itemsError;

      toast({ title: andGenerate ? "บันทึกและสร้างหนังสือรับรองสำเร็จ" : "บันทึกฉบับร่างสำเร็จ" });

      if (andGenerate) {
        generatePDF(payeeInfo);
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = (payeeInfo?: { name: string; taxId: string; address: string; type: string }) => {
    const pi = payeeInfo || (() => {
      const info = getPayeeInfo();
      if (!info) { toast({ title: "กรุณาเลือกผู้ถูกหักภาษี", variant: "destructive" }); return null; }
      return info;
    })();
    if (!pi) return;
    if (totalGross <= 0) { toast({ title: "กรุณากรอกจำนวนเงิน", variant: "destructive" }); return; }

    const payerTaxBoxes = formatTaxIdBoxes(payer.taxId.replace(/\D/g, ""));
    const payeeTaxBoxes = formatTaxIdBoxes(pi.taxId.replace(/\D/g, ""));
    const pndLabel = PND_TYPES.find(p => p.value === pndType)?.label || "ภ.ง.ด.3";
    const conditionLabel = PAYER_CONDITION_OPTIONS.find(c => c.value === payerCondition)?.label || "หัก ณ ที่จ่าย";

    const lineItemsHtml = lineItems.map(item => {
      const incomeType = INCOME_TYPES[item.incomeTypeIndex];
      return `<tr>
        <td>${incomeType.label}</td>
        <td style="text-align:center;">${item.paymentDate ? new Date(item.paymentDate).toLocaleDateString("th-TH") : "-"}</td>
        <td style="text-align:right;">${item.grossAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;">${item.taxAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>หนังสือรับรองหัก ณ ที่จ่าย - ${pi.name}</title>
<style>
  @media print { body { margin: 0; } @page { size: A4; margin: 15mm; } .no-print { display: none; } }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; font-size: 14px; line-height: 1.6; max-width: 700px; margin: 20px auto; padding: 20px; }
  .header { text-align: center; margin-bottom: 15px; }
  .header h2 { margin: 5px 0; font-size: 18px; }
  .header h3 { margin: 5px 0; font-size: 15px; font-weight: normal; }
  .section { border: 1px solid #000; padding: 10px 15px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .label { font-weight: bold; min-width: 180px; }
  table.income { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.income th, table.income td { border: 1px solid #000; padding: 5px 8px; font-size: 13px; }
  table.income th { background: #f0f0f0; text-align: center; }
  .tax-box { display:inline-block;width:20px;height:24px;border:1px solid #000;text-align:center;line-height:24px;font-size:13px;margin:0 1px; }
  .checkbox { display:inline-block;width:14px;height:14px;border:1px solid #000;margin-right:4px;vertical-align:middle;text-align:center;line-height:14px;font-size:11px; }
  .checked { background:#000;color:#fff; }
  .sign-section { display:flex;justify-content:space-between;margin-top:40px; }
  .sign-box { text-align:center;width:45%; }
  .sign-line { border-top:1px dotted #000;margin-top:50px;padding-top:5px; }
  .print-btn { background:#e11d48;color:white;border:none;padding:12px 30px;font-size:16px;cursor:pointer;border-radius:6px;display:block;margin:20px auto; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>

<div class="header">
  <h2>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
  <h3>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</h3>
</div>

<div class="section">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div>
      ${PND_TYPES.map(p => `<span class="checkbox ${pndType === p.value ? 'checked' : ''}">${pndType === p.value ? '✓' : '&ensp;'}</span> ${p.label}&nbsp;&nbsp;`).join("")}
    </div>
    <div style="font-size:13px;">เลขที่ ${docNumber || "............"} &nbsp; วันที่ ${new Date(issueDate).toLocaleDateString("th-TH")}</div>
  </div>
</div>

<div class="section">
  <p style="font-weight:bold;margin:0 0 6px;">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</p>
  <div class="row"><span class="label">ชื่อ:</span><span>${payer.name}</span></div>
  <div class="row"><span class="label">เลขประจำตัวผู้เสียภาษี:</span><span>${payerTaxBoxes}</span></div>
  <div class="row"><span class="label">ที่อยู่:</span><span>${payer.address}</span></div>
</div>

<div class="section">
  <p style="font-weight:bold;margin:0 0 6px;">ผู้ถูกหักภาษี ณ ที่จ่าย</p>
  <div class="row"><span class="label">ชื่อ:</span><span>${pi.name}</span></div>
  <div class="row"><span class="label">เลขประจำตัวผู้เสียภาษี:</span><span>${payeeTaxBoxes}</span></div>
  <div class="row"><span class="label">ที่อยู่:</span><span>${pi.address || "-"}</span></div>
</div>

<table class="income">
  <thead>
    <tr>
      <th>ประเภทเงินได้พึงประเมินที่จ่าย</th>
      <th>วัน เดือน ปี ที่จ่าย</th>
      <th>จำนวนเงินที่จ่าย</th>
      <th>ภาษีที่หักและนำส่งไว้</th>
    </tr>
  </thead>
  <tbody>
    ${lineItemsHtml}
    <tr style="font-weight:bold;background:#f9f9f9;">
      <td colspan="2" style="text-align:center;">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
      <td style="text-align:right;">${totalGross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;">${totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>

<p style="font-size:13px;">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): <strong>${numberToThaiText(totalTax)}</strong></p>

<div style="margin:12px 0;">
  ${PAYER_CONDITION_OPTIONS.map(c => `<span class="checkbox ${payerCondition === c.value ? 'checked' : ''}">${payerCondition === c.value ? '✓' : '&ensp;'}</span> ${c.label}&nbsp;&nbsp;`).join("")}
</div>

<div class="sign-section">
  <div class="sign-box"><div class="sign-line">ผู้จ่ายเงิน</div><p style="font-size:12px;">วันที่ ........./........./.........</p></div>
  <div class="sign-box"><div class="sign-line">ผู้รับเงิน</div><p style="font-size:12px;">วันที่ ........./........./.........</p></div>
</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const formatTaxIdBoxes = (digits: string) => {
    return digits.padEnd(13, " ").split("").map(d =>
      `<span class="tax-box">${d.trim()}</span>`
    ).join("");
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/wht-report")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">หนังสือรับรองหัก ณ ที่จ่าย</h1>
            <p className="text-xs text-muted-foreground">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Section 1: Document Info */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">เลขที่เอกสาร</Label>
                <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Auto / กรอกเอง" />
              </div>
              <div>
                <Label className="text-xs">วันที่ออกเอกสาร</Label>
                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Payer & Payee */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Payer */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div>
                <Label className="text-xs">ชื่อบริษัท</Label>
                <Input value={payer.name} onChange={e => setPayer({ ...payer, name: e.target.value })} placeholder="ชื่อบริษัท" />
              </div>
              <div>
                <Label className="text-xs">เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
                <Input value={payer.taxId} onChange={e => setPayer({ ...payer, taxId: e.target.value })} placeholder="X-XXXX-XXXXX-XX-X" maxLength={17} />
              </div>
              <div>
                <Label className="text-xs">ที่อยู่</Label>
                <Input value={payer.address} onChange={e => setPayer({ ...payer, address: e.target.value })} placeholder="ที่อยู่" />
              </div>
            </CardContent>
          </Card>

          {/* Payee */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">ผู้ถูกหักภาษี ณ ที่จ่าย</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {!selectedPayee && !isNewPayee ? (
                <>
                  <div>
                    <Label className="text-xs">ค้นหาทีมงาน / คู่ค้า</Label>
                    <Input value={payeeSearch} onChange={e => setPayeeSearch(e.target.value)} placeholder="พิมพ์ชื่อหรือเลขภาษี..." />
                  </div>
                  {filteredPayees.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredPayees.map(p => (
                        <div key={`${p.source}-${p.id}`} className="flex items-center justify-between p-2 rounded-md border cursor-pointer hover:bg-accent text-sm" onClick={() => selectPayee(p)}>
                          <div>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{p.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}</span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{p.taxId || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setIsNewPayee(true)}>
                    <Plus className="h-3 w-3 mr-1" /> เพิ่มใหม่
                  </Button>
                </>
              ) : selectedPayee ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{selectedPayee.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPayee(null)}>
                      <X className="h-3 w-3" /> เปลี่ยน
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">เลขภาษี: {selectedPayee.taxId || "-"}</p>
                  <p className="text-xs text-muted-foreground">ที่อยู่: {selectedPayee.address || "-"}</p>
                  <p className="text-xs text-muted-foreground">ประเภท: {selectedPayee.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium">ข้อมูลผู้ถูกหักภาษีใหม่</Label>
                    <Button variant="ghost" size="sm" onClick={() => setIsNewPayee(false)}>
                      <X className="h-3 w-3" /> ยกเลิก
                    </Button>
                  </div>
                  <Input value={newPayee.name} onChange={e => setNewPayee({ ...newPayee, name: e.target.value })} placeholder="ชื่อ" />
                  <RadioGroup value={newPayee.type} onValueChange={(v) => {
                    setNewPayee({ ...newPayee, type: v as "individual" | "company" });
                    setPndType(v === "company" ? "53" : "3");
                  }} className="flex gap-4">
                    <div className="flex items-center gap-1.5"><RadioGroupItem value="individual" id="ind" /><Label htmlFor="ind" className="text-xs">บุคคลธรรมดา</Label></div>
                    <div className="flex items-center gap-1.5"><RadioGroupItem value="company" id="corp" /><Label htmlFor="corp" className="text-xs">นิติบุคคล</Label></div>
                  </RadioGroup>
                  <Input value={newPayee.taxId} onChange={e => setNewPayee({ ...newPayee, taxId: e.target.value })} placeholder="เลขประจำตัวผู้เสียภาษี" maxLength={17} />
                  <Input value={newPayee.address} onChange={e => setNewPayee({ ...newPayee, address: e.target.value })} placeholder="ที่อยู่" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PND Type Selection */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <Label className="text-xs mb-2 block">ประเภทแบบแสดงรายการภาษี</Label>
            <RadioGroup value={pndType} onValueChange={setPndType} className="flex flex-wrap gap-3">
              {PND_TYPES.map(p => (
                <div key={p.value} className="flex items-center gap-1.5">
                  <RadioGroupItem value={p.value} id={`pnd-${p.value}`} />
                  <Label htmlFor={`pnd-${p.value}`} className="text-sm">{p.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Section 3: Income & Tax Table */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">รายการเงินได้และภาษีหัก ณ ที่จ่าย</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[180px]">ประเภทเงินได้</TableHead>
                    <TableHead className="text-xs min-w-[120px]">วันที่จ่าย</TableHead>
                    <TableHead className="text-xs text-right min-w-[110px]">จำนวนเงิน</TableHead>
                    <TableHead className="text-xs text-right min-w-[70px]">อัตรา(%)</TableHead>
                    <TableHead className="text-xs text-right min-w-[100px]">ภาษีหัก</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="p-1">
                        <Select value={String(item.incomeTypeIndex)} onValueChange={v => updateLineItem(item.id, "incomeTypeIndex", Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INCOME_TYPES.map((t, i) => (
                              <SelectItem key={i} value={String(i)} className="text-xs">{t.label} ({t.rate}%)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1">
                        <Input type="date" className="h-8 text-xs" value={item.paymentDate} onChange={e => updateLineItem(item.id, "paymentDate", e.target.value)} />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input type="number" className="h-8 text-xs text-right" value={item.grossAmount || ""} onChange={e => updateLineItem(item.id, "grossAmount", Number(e.target.value))} placeholder="0.00" />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input type="number" className="h-8 text-xs text-right w-16" value={item.taxRate} onChange={e => updateLineItem(item.id, "taxRate", Number(e.target.value))} />
                      </TableCell>
                      <TableCell className="p-1 text-right text-sm font-medium">
                        {item.taxAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(item.id)} disabled={lineItems.length <= 1}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setLineItems(prev => [...prev, createLineItem()])}>
              <Plus className="h-3 w-3 mr-1" /> เพิ่มรายการ
            </Button>
          </CardContent>
        </Card>

        {/* Section 4: Summary */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">รวมเงินที่จ่าย</span>
              <span className="text-lg font-bold">{totalGross.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">รวมเงินภาษีที่หักนำส่ง</span>
              <span className="text-lg font-bold text-destructive">{totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <Separator />
            <div>
              <Label className="text-xs text-muted-foreground">จำนวนภาษี (ตัวอักษร)</Label>
              <p className="text-sm font-medium">{totalTax > 0 ? numberToThaiText(totalTax) : "-"}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-xs mb-2 block">ผู้จ่ายเงิน</Label>
              <RadioGroup value={payerCondition} onValueChange={setPayerCondition} className="flex flex-wrap gap-3">
                {PAYER_CONDITION_OPTIONS.map(c => (
                  <div key={c.value} className="flex items-center gap-1.5">
                    <RadioGroupItem value={c.value} id={`cond-${c.value}`} />
                    <Label htmlFor={`cond-${c.value}`} className="text-sm">{c.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 z-20">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => navigate("/wht-report")}>
            ยกเลิก
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => saveCertificate(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> บันทึกฉบับร่าง
          </Button>
          <Button className="flex-[2]" onClick={() => saveCertificate(true)} disabled={saving}>
            <FileText className="h-4 w-4 mr-1" /> บันทึก & สร้าง PDF
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhtCertificateForm;
