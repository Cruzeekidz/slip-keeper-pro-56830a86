import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Users, Copy, Check, Upload, Eye } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface StaffProfile {
  id: string;
  user_id: string;
  staff_name: string;
  nickname: string | null;
  position: string | null;
  tax_id: string | null;
  daily_rate: number;
  phone: string | null;
  line_user_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  id_card_url: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  staff_name: "",
  nickname: "",
  position: "",
  tax_id: "",
  daily_rate: 0,
  phone: "",
  email: "",
  bank_name: "",
  bank_account: "",
  address: "",
};

const StaffManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("*")
        .order("staff_name");
      if (error) throw error;
      return data as StaffProfile[];
    },
    enabled: !!user,
  });

  const uploadIdCard = async (staffId: string): Promise<string | null> => {
    if (!idCardFile || !user) return null;
    const ext = idCardFile.name.split(".").pop();
    const path = `${user.id}/id-cards/${staffId}.${ext}`;
    const { error } = await supabase.storage.from("documents").upload(path, idCardFile, { upsert: true });
    if (error) { console.error(error); return null; }
    return path;
  };

  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyForm) => {
      if (!user) throw new Error("Not authenticated");
      setUploading(true);

      if (editingId) {
        const updatePayload: Record<string, unknown> = {
          ...values,
          daily_rate: Number(values.daily_rate),
        };
        if (idCardFile) {
          const url = await uploadIdCard(editingId);
          if (url) updatePayload.id_card_url = url;
        }
        const { error } = await supabase.from("staff_profiles").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("staff_profiles").insert({
          staff_name: values.staff_name,
          nickname: values.nickname || null,
          position: values.position || null,
          tax_id: values.tax_id || null,
          daily_rate: Number(values.daily_rate),
          phone: values.phone || null,
          email: values.email || null,
          bank_name: values.bank_name || null,
          bank_account: values.bank_account || null,
          address: values.address || null,
          user_id: user.id,
        }).select("id").single();
        if (error) throw error;
        if (idCardFile && data) {
          const url = await uploadIdCard(data.id);
          if (url) {
            await supabase.from("staff_profiles").update({ id_card_url: url }).eq("id", data.id);
          }
        }
      }
      setUploading(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profiles"] });
      toast({ title: editingId ? "แก้ไขสำเร็จ" : "เพิ่มทีมงานสำเร็จ" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setIdCardFile(null);
    },
    onError: () => { setUploading(false); toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profiles"] });
      toast({ title: "ลบทีมงานสำเร็จ" });
    },
  });

  const openEdit = (staff: StaffProfile) => {
    setEditingId(staff.id);
    setForm({
      staff_name: staff.staff_name,
      nickname: staff.nickname || "",
      position: staff.position || "",
      tax_id: staff.tax_id || "",
      daily_rate: staff.daily_rate,
      phone: staff.phone || "",
      email: staff.email || "",
      bank_name: staff.bank_name || "",
      bank_account: staff.bank_account || "",
      address: staff.address || "",
    });
    setIdCardFile(null);
    setDialogOpen(true);
  };

  const copyInvoiceLink = (staffId: string) => {
    const url = `${window.location.origin}/staff-invoice?staff=${staffId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(staffId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "คัดลอกลิงก์แล้ว" });
  };

  const viewIdCard = async (path: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Users className="h-6 w-6" />
          <h1 className="text-xl font-bold">จัดการทะเบียนทีมงาน</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); setIdCardFile(null); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />เพิ่มทีมงานใหม่</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "แก้ไขข้อมูลทีมงาน" : "เพิ่มทีมงานใหม่"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ชื่อ-นามสกุล *</Label>
                    <Input value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} required />
                  </div>
                  <div>
                    <Label>ชื่อเล่น</Label>
                    <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ตำแหน่ง / หน้าที่</Label>
                    <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="เช่น ช่างภาพ, MC, ผู้ช่วย" />
                  </div>
                  <div>
                    <Label>ค่าแรง/วัน (บาท) *</Label>
                    <Input type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>เลขบัตรประชาชน</Label>
                    <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} maxLength={13} placeholder="13 หลัก" />
                  </div>
                  <div>
                    <Label>อีเมล</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                  </div>
                </div>
                <div>
                  <Label>เบอร์โทร</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label>อัปโหลดหน้าบัตรประชาชน</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1" />{idCardFile ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
                    </Button>
                    {idCardFile && <span className="text-sm text-muted-foreground truncate max-w-[200px]">{idCardFile.name}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ธนาคาร</Label>
                    <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>เลขบัญชี</Label>
                    <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>ที่อยู่</Label>
                  <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                </div>
                <Button type="submit" className="w-full" disabled={saveMutation.isPending || uploading}>
                  {saveMutation.isPending || uploading ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มทีมงาน"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">รายชื่อทีมงาน ({staffList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
            ) : staffList.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">ยังไม่มีข้อมูลทีมงาน</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>ชื่อเล่น</TableHead>
                      <TableHead>ตำแหน่ง</TableHead>
                      <TableHead className="text-right">ค่าแรง/วัน</TableHead>
                      <TableHead>ธนาคาร</TableHead>
                      <TableHead>บัตร</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffList.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.staff_name}</TableCell>
                        <TableCell>{s.nickname || "-"}</TableCell>
                        <TableCell>{s.position || "-"}</TableCell>
                        <TableCell className="text-right">{s.daily_rate.toLocaleString()}</TableCell>
                        <TableCell>{s.bank_name ? `${s.bank_name} ${s.bank_account || ""}` : "-"}</TableCell>
                        <TableCell>
                          {s.id_card_url ? (
                            <Button variant="ghost" size="icon" onClick={() => viewIdCard(s.id_card_url!)} title="ดูบัตร">
                              <Eye className="h-4 w-4 text-primary" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.is_active ? "default" : "secondary"}>
                            {s.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => copyInvoiceLink(s.id)} title="คัดลอกลิงก์ฟอร์ม">
                              {copiedId === s.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { if (confirm("ลบทีมงานนี้?")) deleteMutation.mutate(s.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* ID Card Preview Dialog */}
        <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>หน้าบัตรประชาชน</DialogTitle>
            </DialogHeader>
            {previewUrl && <img src={previewUrl} alt="ID Card" className="w-full rounded-lg" />}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default StaffManagement;
