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
import { ArrowLeft, Plus, Trash2, Save, X } from "lucide-react";
import { INCOME_TYPES, PND_TYPES, type IncomeTypeOption } from "@/lib/wht-constants";

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
  const [editId, setEditId] = useState<string | null>(null);
  const [editLoaded, setEditLoaded] = useState(false);

  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [payeeSearch, setPayeeSearch] = useState("");
  const [payeeOptions, setPayeeOptions] = useState<PayeeOption[]>([]);
  const [selectedPayee, setSelectedPayee] = useState<PayeeOption | null>(null);
  const [isNewPayee, setIsNewPayee] = useState(false);
  const [newPayee, setNewPayee] = useState({ name: "", taxId: "", address: "", type: "individual" as "individual" | "company" });
  const [pndType, setPndType] = useState("3");
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem()]);

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

      // Prefill from URL params
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

  // Edit mode
  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (!editParam || !user || editLoaded) return;
    setEditId(editParam);
    const loadCert = async () => {
      const { data: cert } = await supabase
        .from("wht_certificates")
        .select("*")
        .eq("id", editParam)
        .eq("user_id", user.id)
        .single();
      if (!cert) {
        toast({ title: "ไม่พบเอกสาร", variant: "destructive" });
        return;
      }
      setIssueDate(cert.issue_date);
      setPndType(cert.pnd_type);
      setIsNewPayee(true);
      setNewPayee({
        name: cert.payee_name,
        taxId: cert.payee_tax_id || "",
        address: cert.payee_address || "",
        type: cert.payee_type as "individual" | "company",
      });

      const { data: itemsData } = await supabase
        .from("wht_certificate_items")
        .select("*")
        .eq("certificate_id", editParam)
        .order("created_at");
      if (itemsData && itemsData.length > 0) {
        setLineItems(itemsData.map(i => ({
          id: crypto.randomUUID(),
          incomeTypeIndex: i.income_type_index,
          paymentDate: i.payment_date || new Date().toISOString().split("T")[0],
          grossAmount: Number(i.gross_amount),
          taxRate: Number(i.tax_rate),
          taxAmount: Number(i.tax_amount),
        })));
      }
      setEditLoaded(true);
    };
    loadCert();
  }, [user, searchParams, editLoaded]);

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

  const saveCertificate = async () => {
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
    try {
      let certId = editId;

      if (editId) {
        const { error: certError } = await supabase.from("wht_certificates").update({
          issue_date: issueDate,
          pnd_type: pndType,
          payee_name: payeeInfo.name,
          payee_tax_id: payeeInfo.taxId,
          payee_address: payeeInfo.address,
          payee_type: payeeInfo.type,
          payee_source: payeeInfo.source,
          payee_source_id: payeeInfo.sourceId,
          total_gross: totalGross,
          total_tax: totalTax,
          status: "completed",
        } as any).eq("id", editId);
        if (certError) throw certError;
        await supabase.from("wht_certificate_items").delete().eq("certificate_id", editId);
      } else {
        const { data: cert, error: certError } = await supabase.from("wht_certificates").insert({
          user_id: user.id,
          issue_date: issueDate,
          pnd_type: pndType,
          payee_name: payeeInfo.name,
          payee_tax_id: payeeInfo.taxId,
          payee_address: payeeInfo.address,
          payee_type: payeeInfo.type,
          payee_source: payeeInfo.source,
          payee_source_id: payeeInfo.sourceId,
          total_gross: totalGross,
          total_tax: totalTax,
          source_invoice_id: searchParams.get("source_id") || null,
          source_type: searchParams.get("source_type") || null,
          status: "completed",
        } as any).select().single();
        if (certError) throw certError;
        certId = cert.id;
      }

      const items = lineItems.map(item => ({
        certificate_id: certId,
        income_type_index: item.incomeTypeIndex,
        income_type_label: INCOME_TYPES[item.incomeTypeIndex]?.label || "",
        payment_date: item.paymentDate,
        gross_amount: item.grossAmount,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
      }));

      const { error: itemsError } = await supabase.from("wht_certificate_items").insert(items as any);
      if (itemsError) throw itemsError;

      toast({ title: "บันทึกสำเร็จ" });
      navigate("/wht-certificates");
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/wht-certificates")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{editId ? "แก้ไข" : "บันทึก"}รายการหัก ณ ที่จ่าย</h1>
            <p className="text-xs text-muted-foreground">บันทึกข้อมูลเพื่อติดตามการเปิดเอกสารใน FlowAccount</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Date */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div>
              <Label className="text-xs">วันที่จ่ายเงิน</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Payee */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">ผู้ถูกหักภาษี</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {!selectedPayee && !isNewPayee ? (
              <>
                <div>
                  <Label className="text-xs">ค้นหาทีมงาน / คู่ค้า</Label>
                  <Input value={payeeSearch} onChange={e => setPayeeSearch(e.target.value)} placeholder="พิมพ์ชื่อ..." />
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
                <Input value={newPayee.taxId} onChange={e => setNewPayee({ ...newPayee, taxId: e.target.value })} placeholder="เลขผู้เสียภาษี" maxLength={17} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* PND Type */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <Label className="text-xs mb-2 block">แบบ ภ.ง.ด.</Label>
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

        {/* Income Items */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">รายการเงินได้และภาษีหัก</CardTitle>
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

        {/* Summary */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">รวมเงินที่จ่าย</span>
              <span className="text-lg font-bold">{totalGross.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">รวมภาษีหัก ณ ที่จ่าย</span>
              <span className="text-lg font-bold text-destructive">{totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 z-20">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => navigate("/wht-certificates")}>
            ยกเลิก
          </Button>
          <Button className="flex-[2]" onClick={saveCertificate} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhtCertificateForm;
