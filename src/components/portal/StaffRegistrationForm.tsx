import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Users, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import browserImageCompression from "browser-image-compression";

const OWNER_USER_ID = ""; // Will be set via query param

interface StaffRegistrationFormProps {
  lineUserId?: string | null;
  lineDisplayName?: string | null;
}

const StaffRegistrationForm = ({ lineUserId, lineDisplayName }: StaffRegistrationFormProps) => {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string>("");

  const [form, setForm] = useState({
    staff_name: "",
    nickname: "",
    position: "",
    phone: "",
    email: "",
    tax_id: "",
    bank_name: "",
    bank_account: "",
    address: "",
    daily_rate: 0,
  });

  const handleIdCardChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await browserImageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      setIdCardFile(compressed);
      setIdCardPreview(URL.createObjectURL(compressed));
    } catch {
      setIdCardFile(file);
      setIdCardPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_name || !form.phone) {
      toast({ title: "กรุณากรอกชื่อและเบอร์โทร", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    try {
      // Get owner user_id from URL params
      const params = new URLSearchParams(window.location.search);
      const ownerId = params.get("owner");
      if (!ownerId) {
        toast({ title: "ลิงก์ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      let idCardUrl = null;

      // Upload ID card if provided
      if (idCardFile) {
        const fileName = `id-cards/${ownerId}/${Date.now()}-${idCardFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, idCardFile);
        if (!uploadError) {
          idCardUrl = fileName;
        }
      }

      const { error } = await supabase.from("staff_profiles").insert({
        user_id: ownerId,
        staff_name: form.staff_name,
        nickname: form.nickname || null,
        position: form.position || null,
        phone: form.phone || null,
        email: form.email || null,
        tax_id: form.tax_id || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        address: form.address || null,
        daily_rate: form.daily_rate || 0,
        id_card_url: idCardUrl,
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
          <h2 className="text-xl font-bold">ลงทะเบียนสำเร็จ!</h2>
          <p className="text-muted-foreground">ข้อมูลของคุณถูกบันทึกเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแล</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Users className="h-10 w-10 mx-auto text-primary mb-2" />
        <CardTitle>ลงทะเบียนทีมงานใหม่</CardTitle>
        <CardDescription>กรอกข้อมูลเพื่อสมัครเป็นทีมงาน</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>ชื่อ-นามสกุล *</Label>
            <Input value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} required placeholder="ชื่อจริง นามสกุล" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ชื่อเล่น</Label>
              <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="ชื่อเล่น" />
            </div>
            <div>
              <Label>ตำแหน่ง/หน้าที่</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="เช่น ช่างภาพ" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เบอร์โทร *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="08x-xxx-xxxx" />
            </div>
            <div>
              <Label>อีเมล</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
          </div>
          <div>
            <Label>เลขบัตรประชาชน (13 หลัก)</Label>
            <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} placeholder="x-xxxx-xxxxx-xx-x" maxLength={17} />
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
                  <SelectItem value="ออมสิน">ออมสิน</SelectItem>
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
            <Label>ที่อยู่</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ที่อยู่สำหรับออกเอกสาร" />
          </div>
          <div>
            <Label>ค่าแรง/วัน (บาท)</Label>
            <Input type="number" value={form.daily_rate || ""} onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })} placeholder="0" />
          </div>

          <div>
            <Label>อัพโหลดหน้าบัตรประชาชน</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{idCardFile ? idCardFile.name : "คลิกเพื่อเลือกไฟล์"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleIdCardChange} />
              </label>
            </div>
            {idCardPreview && (
              <img src={idCardPreview} alt="ID Card Preview" className="mt-2 rounded-lg max-h-40 object-contain" />
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "ลงทะเบียน"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default StaffRegistrationForm;
