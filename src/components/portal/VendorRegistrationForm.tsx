import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Building2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import browserImageCompression from "browser-image-compression";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VendorRegistrationFormProps {
  lineUserId?: string | null;
  lineDisplayName?: string | null;
}

const VendorRegistrationForm = ({ lineUserId, lineDisplayName }: VendorRegistrationFormProps) => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const ownerId = searchParams.get("owner");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taxDocFile, setTaxDocFile] = useState<File | null>(null);
  const [taxDocPreview, setTaxDocPreview] = useState<string>("");

  const [form, setForm] = useState({
    vendor_type: "company",
    company_name: "",
    tax_id: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    bank_name: "",
    bank_account: "",
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      try {
        const compressed = await browserImageCompression(file, {
          maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
        });
        setTaxDocFile(compressed);
        setTaxDocPreview(URL.createObjectURL(compressed));
      } catch {
        setTaxDocFile(file);
        setTaxDocPreview(URL.createObjectURL(file));
      }
    } else {
      setTaxDocFile(file);
      setTaxDocPreview("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId || !UUID_REGEX.test(ownerId)) {
      toast({ title: "ลิงก์ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล", variant: "destructive" });
      return;
    }
    if (!form.company_name) {
      toast({ title: "กรุณากรอกชื่อบริษัท/ร้านค้า", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    try {
      let taxDocUrl = null;
      if (taxDocFile) {
        const fileName = `tax-docs/${ownerId}/${Date.now()}-${taxDocFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, taxDocFile);
        if (!uploadError) taxDocUrl = fileName;
      }

      const { error } = await supabase.from("vendor_profiles").insert({
        user_id: ownerId,
        vendor_type: form.vendor_type,
        company_name: form.company_name,
        tax_id: form.tax_id || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        tax_doc_url: taxDocUrl,
        line_user_id: lineUserId || null,
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">ลงทะเบียนคู่ค้าสำเร็จ!</h2>
          <p className="text-muted-foreground">ข้อมูลถูกบันทึกเรียบร้อยแล้ว</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Building2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
        <CardTitle>ลงทะเบียนคู่ค้า</CardTitle>
        <CardDescription>กรอกข้อมูลบริษัท/ร้านค้า เพื่อลงทะเบียนเป็นคู่ค้า</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>ประเภท *</Label>
            <Select value={form.vendor_type} onValueChange={(v) => setForm({ ...form, vendor_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">นิติบุคคล / บริษัท</SelectItem>
                <SelectItem value="individual">บุคคลธรรมดา / ร้านค้า</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{form.vendor_type === "company" ? "ชื่อบริษัท *" : "ชื่อร้านค้า / ชื่อ-สกุล *"}</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required placeholder={form.vendor_type === "company" ? "บริษัท xxx จำกัด" : "ร้าน xxx"} />
          </div>
          <div>
            <Label>เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน</Label>
            <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} placeholder="13 หลัก" maxLength={17} />
          </div>
          <div>
            <Label>ชื่อผู้ติดต่อ</Label>
            <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="ชื่อผู้ประสานงาน" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เบอร์โทร</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0xx-xxx-xxxx" />
            </div>
            <div>
              <Label>อีเมล</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" />
            </div>
          </div>
          <div>
            <Label>ที่อยู่</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ที่อยู่สำหรับออกเอกสาร" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ธนาคาร</Label>
              <Select value={form.bank_name} onValueChange={(v) => setForm({ ...form, bank_name: v })}>
                <SelectTrigger><SelectValue placeholder="เลือกธนาคาร" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="กสิกรไทย">กสิกรไทย</SelectItem>
                  <SelectItem value="กรุงเทพ">กรุงเทพ</SelectItem>
                  <SelectItem value="ไทยพาณิชย์">ไทยพาณิชย์</SelectItem>
                  <SelectItem value="กรุงไทย">กรุงไทย</SelectItem>
                  <SelectItem value="ทหารไทยธนชาต">ทหารไทยธนชาต</SelectItem>
                  <SelectItem value="กรุงศรี">กรุงศรี</SelectItem>
                  <SelectItem value="อื่นๆ">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>เลขบัญชี</Label>
              <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} placeholder="xxx-x-xxxxx-x" />
            </div>
          </div>

          <div>
            <Label>แนบ ภพ.20 หรือหน้าบัตรประชาชน</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{taxDocFile ? taxDocFile.name : "คลิกเพื่อเลือกไฟล์ (รูปภาพ หรือ PDF)"}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            {taxDocPreview && (
              <img src={taxDocPreview} alt="Tax Doc Preview" className="mt-2 rounded-lg max-h-40 object-contain" />
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "ลงทะเบียนคู่ค้า"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default VendorRegistrationForm;
