import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft, Wallet } from "lucide-react";

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  entity: string | null;
  is_active: boolean;
  notes: string | null;
}

const ENTITIES = [
  { value: "personal", label: "ส่วนตัว" },
  { value: "business", label: "ธุรกิจหลัก" },
  { value: "bcc-next", label: "BCC Next" },
  { value: "kukanang", label: "คู่ขนาน" },
];

export default function BankAccounts() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState({
    account_name: "",
    account_number: "",
    bank_name: "",
    entity: "business",
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => { if (user) fetchAccounts(); }, [user]);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("bank_accounts").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "โหลดไม่สำเร็จ", description: error.message, variant: "destructive" });
    else setAccounts((data || []) as BankAccount[]);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ account_name: "", account_number: "", bank_name: "", entity: "business", is_active: true, notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (a: BankAccount) => {
    setEditing(a);
    setForm({
      account_name: a.account_name,
      account_number: a.account_number,
      bank_name: a.bank_name,
      entity: a.entity || "business",
      is_active: a.is_active,
      notes: a.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.account_name || !form.account_number || !form.bank_name) {
      toast({ title: "ข้อมูลไม่ครบ", description: "กรุณากรอกชื่อบัญชี, เลขบัญชี, ธนาคาร", variant: "destructive" });
      return;
    }
    const payload = { ...form, user_id: user.id };
    const { error } = editing
      ? await supabase.from("bank_accounts").update(payload).eq("id", editing.id)
      : await supabase.from("bank_accounts").insert(payload);
    if (error) {
      toast({ title: "บันทึกไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "แก้ไขสำเร็จ" : "เพิ่มสำเร็จ" });
    setDialogOpen(false);
    fetchAccounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบบัญชีนี้?")) return;
    const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
    if (error) toast({ title: "ลบไม่สำเร็จ", description: error.message, variant: "destructive" });
    else { toast({ title: "ลบสำเร็จ" }); fetchAccounts(); }
  };

  if (authLoading || loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
          <Wallet className="h-6 w-6" />
          <h1 className="text-2xl font-bold">บัญชีธนาคารของฉัน</h1>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>รายการบัญชี ({accounts.length})</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">ใช้เป็นตัวเลือกเวลาบันทึกผู้โอนในรายการ</p>
            </div>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />เพิ่มบัญชี</Button>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">ยังไม่มีบัญชีธนาคาร</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ธนาคาร</TableHead>
                    <TableHead>ชื่อบัญชี</TableHead>
                    <TableHead>เลขบัญชี</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.bank_name}</TableCell>
                      <TableCell>{a.account_name}</TableCell>
                      <TableCell className="font-mono">{a.account_number}</TableCell>
                      <TableCell>{ENTITIES.find(e => e.value === a.entity)?.label || a.entity || "-"}</TableCell>
                      <TableCell>{a.is_active ? "ใช้งาน" : "ปิด"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="h-3 w-3" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "แก้ไข" : "เพิ่ม"}บัญชีธนาคาร</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>ธนาคาร *</Label>
                <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="เช่น KBANK, SCB, BBL" />
              </div>
              <div>
                <Label>ชื่อบัญชี *</Label>
                <Input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} />
              </div>
              <div>
                <Label>เลขบัญชี *</Label>
                <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} />
              </div>
              <div>
                <Label>Entity / ใช้กับ</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3" value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })}>
                  {ENTITIES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <Label>หมายเหตุ</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <Label>ใช้งาน</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSave}>บันทึก</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
