import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Upload, FileImage, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import browserImageCompression from "browser-image-compression";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VendorBillUpload = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const ownerId = searchParams.get("owner");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string>("");

  const [form, setForm] = useState({
    company_name: "",
    invoice_number: "",
    amount: 0,
    description: "",
    notes: "",
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      try {
        const compressed = await browserImageCompression(file, {
          maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
        });
        setBillFile(compressed);
        setBillPreview(URL.createObjectURL(compressed));
      } catch {
        setBillFile(file);
        setBillPreview(URL.createObjectURL(file));
      }
    } else {
      setBillFile(file);
      setBillPreview("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId || !UUID_REGEX.test(ownerId)) {
      toast({ title: "ลิงก์ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล", variant: "destructive" });
      return;
    }
    if (!billFile) {
      toast({ title: "กรุณาแนบไฟล์บิล", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    try {
      // Upload bill file
      const fileName = `vendor-bills/${ownerId}/${Date.now()}-${billFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, billFile);
      if (uploadError) throw uploadError;

      // Create vendor invoice record
      const { error } = await supabase.from("vendor_invoices").insert({
        user_id: ownerId,
        invoice_number: form.invoice_number || null,
        amount: form.amount || 0,
        net_amount: form.amount || 0,
        description: form.company_name ? `${form.company_name} - ${form.description}` : form.description || "บิลจากคู่ค้า",
        file_url: fileName,
        notes: form.notes || null,
        status: "pending",
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (!ownerId || !UUID_REGEX.test(ownerId)) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <Upload className="h-16 w-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">ลิงก์ไม่ถูกต้อง</h2>
          <p className="text-muted-foreground">กรุณาเข้าผ่านลิงก์ที่ได้รับจากผู้ดูแลหรือ LINE เท่านั้น</p>
        </CardContent>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">ส่งบิลสำเร็จ!</h2>
          <p className="text-muted-foreground">ไฟล์บิลถูกอัพโหลดเรียบร้อยแล้ว รอการตรวจสอบจากผู้ดูแล</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Upload className="h-10 w-10 mx-auto text-orange-500 mb-2" />
        <CardTitle>ส่งบิล / ใบแจ้งหนี้</CardTitle>
        <CardDescription>อัพโหลดไฟล์ภาพหรือ PDF ใบแจ้งหนี้</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>ชื่อบริษัท/ร้านค้า</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="ชื่อผู้ออกบิล" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เลขที่ใบแจ้งหนี้</Label>
              <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="INV-xxxx" />
            </div>
            <div>
              <Label>ยอดเงิน (บาท)</Label>
              <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>รายละเอียด</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="รายการสินค้า/บริการ" />
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="หมายเหตุเพิ่มเติม" />
          </div>

          <div>
            <Label>แนบไฟล์บิล / ใบแจ้งหนี้ *</Label>
            <div className="mt-1">
              <label className="flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-6 hover:bg-muted/50 transition-colors">
                {billFile ? (
                  <>
                    {billPreview ? (
                      <FileImage className="h-8 w-8 text-primary" />
                    ) : (
                      <File className="h-8 w-8 text-primary" />
                    )}
                    <span className="text-sm font-medium">{billFile.name}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">คลิกเพื่อเลือกไฟล์ภาพหรือ PDF</span>
                  </>
                )}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            {billPreview && (
              <img src={billPreview} alt="Bill Preview" className="mt-2 rounded-lg max-h-48 object-contain mx-auto" />
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting || !billFile}>
            {submitting ? "กำลังอัพโหลด..." : "ส่งบิล"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default VendorBillUpload;
