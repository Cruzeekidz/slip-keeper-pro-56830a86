import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorProfiles } from "@/hooks/useVendorData";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { buildUploadPath } from "@/lib/storage-path";
import browserImageCompression from "browser-image-compression";
import { Upload, FileImage, File as FileIcon, Send } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function AdminVendorBillSheet({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: vendors = [] } = useVendorProfiles();

  const [vendorId, setVendorId] = useState<string>("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [vatAmount, setVatAmount] = useState<string>("");
  const [whtAmount, setWhtAmount] = useState<string>("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors.slice(0, 20);
    return vendors
      .filter((v: any) => (v.company_name || "").toLowerCase().includes(q) || (v.tax_id || "").includes(q))
      .slice(0, 20);
  }, [vendors, vendorSearch]);

  const gross = Number(amount) || 0;
  const wht = Number(whtAmount) || 0;
  const net = gross - wht;

  const reset = () => {
    setVendorId(""); setVendorSearch(""); setInvoiceNumber(""); setInvoiceDate(new Date().toISOString().split("T")[0]);
    setDueDate(""); setAmount(""); setVatAmount(""); setWhtAmount(""); setDescription(""); setNotes("");
    setFile(null); setPreview("");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type.startsWith("image/")) {
      try {
        const compressed = await browserImageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
        setFile(compressed);
        setPreview(URL.createObjectURL(compressed));
      } catch {
        setFile(f);
        setPreview(URL.createObjectURL(f));
      }
    } else {
      setFile(f);
      setPreview("");
    }
  };

  const submit = async (approveAndPushFA: boolean) => {
    if (!user) return;
    if (!vendorId) { toast({ title: "กรุณาเลือกคู่ค้า", variant: "destructive" }); return; }
    if (!amount || gross <= 0) { toast({ title: "กรุณาระบุยอดบิล", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      let filePath: string | null = null;
      if (file) {
        filePath = buildUploadPath("vendor-bills", user.id, `${Date.now()}-${file.name}`);
        const { error: upErr } = await supabase.storage.from("receipts").upload(filePath, file, { upsert: false });
        if (upErr) throw upErr;
      }

      const { data: inserted, error: insErr } = await supabase.from("vendor_invoices").insert({
        user_id: user.id,
        vendor_id: vendorId,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        amount: gross,
        vat_amount: Number(vatAmount) || 0,
        wht_amount: wht,
        net_amount: net,
        description: description || null,
        notes: notes || null,
        file_url: filePath,
        status: approveAndPushFA ? "approved" : "pending",
        source: "admin",
      } as any).select("id").single();
      if (insErr) throw insErr;

      if (approveAndPushFA && inserted?.id) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke("flowaccount-push-expense-note", {
            body: { invoice_id: inserted.id },
          });
          if (fnErr || !(data as any)?.success) {
            toast({
              title: "บันทึกและอนุมัติแล้ว (⚠️ FA push ล้มเหลว)",
              description: (fnErr?.message || (data as any)?.error || "").slice(0, 200),
              variant: "destructive",
            });
          } else {
            toast({ title: "✅ สร้างบิล + Expense Note บน FA สำเร็จ" });
          }
        } catch (e: any) {
          toast({ title: "บันทึกแล้ว แต่ FA push error", description: e.message, variant: "destructive" });
        }
      } else {
        toast({ title: "บันทึกบิลเป็น draft แล้ว" });
      }

      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "ผิดพลาด", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>➕ สร้างบิลแทนคู่ค้า</SheetTitle>
          <SheetDescription>
            สำหรับกรณีที่คู่ค้าไม่ได้ส่งเข้ามาเอง หรือส่งผ่าน LINE เป็นข้อความ
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Vendor picker */}
          <div>
            <Label>คู่ค้า *</Label>
            <Input placeholder="พิมพ์ชื่อบริษัท / เลขผู้เสียภาษี" value={vendorSearch}
              onChange={(e) => { setVendorSearch(e.target.value); setVendorId(""); }} />
            {vendorSearch && !vendorId && (
              <div className="mt-1 border rounded-md max-h-40 overflow-y-auto">
                {filteredVendors.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">ไม่พบคู่ค้า — เพิ่มที่หน้า Vendor Management ก่อน</p>
                ) : filteredVendors.map((v: any) => (
                  <button key={v.id} type="button"
                    className="w-full text-left px-2 py-1.5 hover:bg-muted text-sm"
                    onClick={() => { setVendorId(v.id); setVendorSearch(v.company_name); }}>
                    {v.company_name}
                    {v.tax_id && <span className="text-xs text-muted-foreground ml-2">· {v.tax_id}</span>}
                  </button>
                ))}
              </div>
            )}
            {vendorId && (
              <p className="text-xs text-green-600 mt-1">✓ เลือกแล้ว</p>
            )}
          </div>

          {/* File */}
          <div>
            <Label>ไฟล์บิล (รูป / PDF)</Label>
            <label className="mt-1 flex flex-col items-center gap-1 cursor-pointer border-2 border-dashed rounded-lg p-4 hover:bg-muted/50">
              {file ? (
                <>
                  {preview ? <FileImage className="h-6 w-6 text-primary" /> : <FileIcon className="h-6 w-6 text-primary" />}
                  <span className="text-xs">{file.name}</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">คลิกเพื่อเลือกไฟล์ (ไม่บังคับ)</span>
                </>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
            </label>
            {preview && <img src={preview} alt="preview" className="mt-2 rounded max-h-32 mx-auto" />}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เลขที่บิล</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-xxx" />
            </div>
            <div>
              <Label>วันที่บิล</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>ครบกำหนด</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>ยอดบิล (Gross) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>VAT</Label>
              <Input type="number" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>หัก ณ ที่จ่าย</Label>
              <Input type="number" value={whtAmount} onChange={(e) => setWhtAmount(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <Label>รายละเอียด</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ค่าอะไร" />
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Gross</span><span>{gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            {wht > 0 && <div className="flex justify-between text-destructive"><span>WHT</span><span>-{wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
            <div className="flex justify-between font-bold text-primary border-t pt-1"><span>ยอดโอน (Net)</span><span>{net.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span></div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => submit(true)} disabled={submitting}>
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "กำลังบันทึก..." : "อนุมัติ + ส่ง FA ตอนนี้"}
            </Button>
            <Button variant="outline" onClick={() => submit(false)} disabled={submitting}>
              บันทึกเป็น draft (รออนุมัติ)
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}