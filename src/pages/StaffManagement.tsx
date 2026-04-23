import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStaffProfiles, useSaveStaff, useDeleteStaff, emptyStaffForm, type StaffFormValues } from "@/hooks/useStaffData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Users, Copy, Check, Upload, Eye, ArrowRightLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { ConvertToVendorDialog } from "@/components/staff/ConvertToVendorDialog";

const StaffManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffFormValues>(emptyStaffForm);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [convertOpen, setConvertOpen] = useState(false);

  const { data: staffList = [], isLoading } = useStaffProfiles();
  const saveMutation = useSaveStaff(editingId, idCardFile);
  const deleteMutation = useDeleteStaff();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === staffList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(staffList.map((s) => s.id)));
  };
  const selectedStaff = staffList.filter((s) => selectedIds.has(s.id));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form, {
      onSuccess: () => {
        setDialogOpen(false);
        setEditingId(null);
        setForm(emptyStaffForm);
        setIdCardFile(null);
      },
    });
  };

  const openEdit = (staff: typeof staffList[0]) => {
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
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
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
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Badge variant="secondary">เลือก {selectedIds.size} คน</Badge>
                <Button size="sm" variant="outline" onClick={() => setConvertOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4 mr-1" />แปลงเป็นคู่ค้า
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  ล้าง
                </Button>
              </>
            )}
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyStaffForm); setIdCardFile(null); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />เพิ่มทีมงานใหม่</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "แก้ไขข้อมูลทีมงาน" : "เพิ่มทีมงานใหม่"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-3">
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
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setIdCardFile(e.target.files?.[0] || null)} />
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
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มทีมงาน"}
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
              <div className="w-full">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={staffList.length > 0 && selectedIds.size === staffList.length}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead className="w-[22%]">ชื่อ</TableHead>
                      <TableHead className="w-[10%] hidden md:table-cell">ชื่อเล่น</TableHead>
                      <TableHead className="w-[14%] hidden lg:table-cell">ตำแหน่ง</TableHead>
                      <TableHead className="w-[12%] text-right">ค่าแรง/วัน</TableHead>
                      <TableHead className="w-[20%] hidden md:table-cell">ธนาคาร</TableHead>
                      <TableHead className="w-[8%] text-center hidden sm:table-cell">บัตร</TableHead>
                      <TableHead className="w-[10%] hidden sm:table-cell">สถานะ</TableHead>
                      <TableHead className="w-[120px] text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffList.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(s.id)}
                            onCheckedChange={() => toggleSelect(s.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="truncate">{s.staff_name}</div>
                          <div className="text-xs text-muted-foreground md:hidden truncate">
                            {[s.nickname, s.position].filter(Boolean).join(" • ") || ""}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell truncate">{s.nickname || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell truncate">{s.position || "-"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{s.daily_rate.toLocaleString()}</TableCell>
                        <TableCell className="hidden md:table-cell truncate" title={s.bank_name ? `${s.bank_name} ${s.bank_account || ""}` : ""}>
                          {s.bank_name ? `${s.bank_name} ${s.bank_account || ""}` : "-"}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          {s.id_card_url ? (
                            <Button variant="ghost" size="icon" onClick={() => viewIdCard(s.id_card_url!)} title="ดูบัตร">
                              <Eye className="h-4 w-4 text-primary" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={s.is_active ? "default" : "secondary"}>
                            {s.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-0.5 justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyInvoiceLink(s.id)} title="คัดลอกลิงก์ฟอร์ม">
                              {copiedId === s.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} title="แก้ไข">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm("ลบทีมงานนี้?")) deleteMutation.mutate(s.id); }} title="ลบ">
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

        <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>หน้าบัตรประชาชน</DialogTitle>
            </DialogHeader>
            {previewUrl && <img src={previewUrl} alt="ID Card" className="w-full rounded-lg" />}
          </DialogContent>
        </Dialog>

        <ConvertToVendorDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          selectedStaff={selectedStaff}
          onDone={() => setSelectedIds(new Set())}
        />
      </main>
    </div>
  );
};

export default StaffManagement;
