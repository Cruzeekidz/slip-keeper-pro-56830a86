import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, CreditCard, CheckCircle, Trash2, Gift, Plus, MessageCircle } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "secondary",
  submitted: "default",
  approved: "outline",
  paid: "default",
};

const statusLabels: Record<string, string> = {
  draft: "ฉบับร่าง",
  submitted: "ส่งแล้ว",
  approved: "อนุมัติแล้ว",
  paid: "จ่ายแล้ว",
};

const StaffPayments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [bonusDialog, setBonusDialog] = useState<{ id: string; current: number } | null>(null);
  const [bonusValue, setBonusValue] = useState(0);
  const [createDialog, setCreateDialog] = useState(false);
  const [lineDialog, setLineDialog] = useState<{ staffName: string; lineUserId: string | null } | null>(null);
  const [lineMessage, setLineMessage] = useState("");

  // Create invoice form state
  const [createForm, setCreateForm] = useState({
    staff_id: "",
    event_name: "",
    days_worked: 1,
    daily_rate: 0,
    work_start_date: "",
    work_end_date: "",
    notes: "",
    wht_mode: "inclusive" as "inclusive" | "exclusive",
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["staff-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoices")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account, tax_id, email, address, line_user_id, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, staff_name, nickname, daily_rate, line_user_id")
        .eq("is_active", true)
        .order("staff_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["event-registry-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registry")
        .select("id, event_name")
        .eq("is_active", true)
        .order("event_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "paid") updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from("staff_invoices").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      toast({ title: "อัปเดตสถานะสำเร็จ" });
    },
  });

  const updateBonusMutation = useMutation({
    mutationFn: async ({ id, bonus }: { id: string; bonus: number }) => {
      const inv = invoices.find((i: any) => i.id === id);
      if (!inv) throw new Error("Not found");
      const newGross = Number(inv.days_worked) * Number(inv.daily_rate) + bonus;
      const newWht = Math.round(newGross * (Number(inv.wht_rate) / 100) * 100) / 100;
      const newNet = newGross - newWht;
      const { error } = await supabase.from("staff_invoices").update({
        bonus_amount: bonus,
        gross_amount: newGross,
        wht_amount: newWht,
        net_amount: newNet,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setBonusDialog(null);
      toast({ title: "บันทึกโบนัสสำเร็จ" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      toast({ title: "ลบรายการสำเร็จ" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!createForm.staff_id) throw new Error("กรุณาเลือกทีมงาน");

      const baseAmount = createForm.days_worked * createForm.daily_rate;
      const grossAmount = createForm.wht_mode === "inclusive"
        ? baseAmount
        : Math.round(baseAmount / 0.97 * 100) / 100;
      const whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
      const netAmount = grossAmount - whtAmount;

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      const { error } = await supabase.from("staff_invoices").insert({
        user_id: user.id,
        staff_id: createForm.staff_id,
        invoice_number: invoiceNumber,
        event_name: createForm.event_name || null,
        days_worked: createForm.days_worked,
        daily_rate: createForm.daily_rate,
        gross_amount: grossAmount,
        wht_rate: 3,
        wht_amount: whtAmount,
        net_amount: netAmount,
        work_start_date: createForm.work_start_date || null,
        work_end_date: createForm.work_end_date || null,
        notes: createForm.notes || null,
        status: "draft",
        submitted_via: "admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setCreateDialog(false);
      setCreateForm({ staff_id: "", event_name: "", days_worked: 1, daily_rate: 0, work_start_date: "", work_end_date: "", notes: "", wht_mode: "inclusive" });
      toast({ title: "สร้างรายการค่าใช้จ่ายสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  const sendLineMutation = useMutation({
    mutationFn: async ({ lineUserId, message }: { lineUserId: string; message: string }) => {
      const { error } = await supabase.functions.invoke("send-reminder-line", {
        body: { lineUserId, message },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLineDialog(null);
      setLineMessage("");
      toast({ title: "ส่งข้อความ LINE สำเร็จ" });
    },
    onError: () => {
      toast({ title: "ส่งข้อความไม่สำเร็จ", variant: "destructive" });
    },
  });

  // Auto-fill daily_rate when staff selected
  const handleStaffSelect = (staffId: string) => {
    const staff = staffList.find((s) => s.id === staffId);
    setCreateForm((prev) => ({
      ...prev,
      staff_id: staffId,
      daily_rate: staff ? Number(staff.daily_rate) : 0,
    }));
  };

  const createBaseAmount = createForm.days_worked * createForm.daily_rate;
  const createGross = createForm.wht_mode === "inclusive" ? createBaseAmount : Math.round(createBaseAmount / 0.97 * 100) / 100;
  const createWht = Math.round(createGross * 0.03 * 100) / 100;
  const createNet = createGross - createWht;

  const filtered = filterStatus === "all" ? invoices : invoices.filter((i: any) => i.status === filterStatus);

  const totalGross = filtered.reduce((sum: number, i: any) => sum + Number(i.gross_amount), 0);
  const totalWht = filtered.reduce((sum: number, i: any) => sum + Number(i.wht_amount), 0);
  const totalNet = filtered.reduce((sum: number, i: any) => sum + Number(i.net_amount), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CreditCard className="h-6 w-6" />
          <h1 className="text-xl font-bold">จัดการจ่ายเงินทีมงาน</h1>
          <div className="ml-auto">
            <Button onClick={() => setCreateDialog(true)} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />สร้างรายการ
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ค่าแรงรวม (Gross)</p>
              <p className="text-xl font-bold">{totalGross.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">หัก ณ ที่จ่าย 3%</p>
              <p className="text-xl font-bold text-destructive">{totalWht.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ยอดจ่ายสุทธิ (Net)</p>
              <p className="text-xl font-bold text-primary">{totalNet.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">สถานะ:</span>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="submitted">ส่งแล้ว</SelectItem>
              <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
              <SelectItem value="paid">จ่ายแล้ว</SelectItem>
              <SelectItem value="draft">ฉบับร่าง</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} รายการ</span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">ไม่มีรายการ</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>ทีมงาน / เลขผู้เสียภาษี</TableHead>
                      <TableHead>อีเวนท์</TableHead>
                      <TableHead className="text-right">วัน</TableHead>
                      <TableHead className="text-right">ค่าแรง/วัน</TableHead>
                      <TableHead className="text-right">โบนัส</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">หัก 3%</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{inv.staff_profiles?.staff_name}</span>
                            {inv.staff_profiles?.nickname && (
                              <span className="text-muted-foreground text-xs ml-1">({inv.staff_profiles.nickname})</span>
                            )}
                          </div>
                          {inv.staff_profiles?.tax_id && (
                            <div className="text-xs text-muted-foreground font-mono">{inv.staff_profiles.tax_id}</div>
                          )}
                        </TableCell>
                        <TableCell>{inv.event_name || "-"}</TableCell>
                        <TableCell className="text-right">{inv.days_worked}</TableCell>
                        <TableCell className="text-right">{Number(inv.daily_rate).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => { setBonusDialog({ id: inv.id, current: Number(inv.bonus_amount || 0) }); setBonusValue(Number(inv.bonus_amount || 0)); }}
                          >
                            {Number(inv.bonus_amount || 0) > 0 ? (
                              <span className="text-primary font-medium">+{Number(inv.bonus_amount).toLocaleString()}</span>
                            ) : (
                              <Gift className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">{Number(inv.gross_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-destructive">{Number(inv.wht_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">{Number(inv.net_amount).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[inv.status] as any}>
                            {statusLabels[inv.status] || inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {inv.status === "submitted" && (
                              <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "approved" })}>
                                <CheckCircle className="h-3 w-3 mr-1" />อนุมัติ
                              </Button>
                            )}
                            {inv.status === "approved" && (
                              <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "paid" })}>
                                <CreditCard className="h-3 w-3 mr-1" />จ่ายแล้ว
                              </Button>
                            )}
                            {inv.staff_profiles?.line_user_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLineDialog({ staffName: inv.staff_profiles?.staff_name || "", lineUserId: inv.staff_profiles?.line_user_id })}
                                title="แชท LINE"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("ลบรายการนี้?")) deleteMutation.mutate(inv.id); }}>
                              <Trash2 className="h-3 w-3 text-destructive" />
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

        {/* Bonus Dialog */}
        <Dialog open={!!bonusDialog} onOpenChange={(open) => { if (!open) setBonusDialog(null); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>เพิ่มโบนัส</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>จำนวนโบนัส (บาท)</Label>
                <Input type="number" value={bonusValue} onChange={(e) => setBonusValue(Number(e.target.value))} min={0} />
              </div>
              <Button className="w-full" onClick={() => bonusDialog && updateBonusMutation.mutate({ id: bonusDialog.id, bonus: bonusValue })} disabled={updateBonusMutation.isPending}>
                {updateBonusMutation.isPending ? "กำลังบันทึก..." : "บันทึกโบนัส"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Invoice Dialog */}
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>สร้างรายการค่าใช้จ่ายทีมงาน</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>ทีมงาน *</Label>
                <Select value={createForm.staff_id} onValueChange={handleStaffSelect}>
                  <SelectTrigger><SelectValue placeholder="เลือกทีมงาน" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.staff_name} {s.nickname ? `(${s.nickname})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>อีเวนท์</Label>
                <Select value={createForm.event_name} onValueChange={(v) => setCreateForm((p) => ({ ...p, event_name: v }))}>
                  <SelectTrigger><SelectValue placeholder="เลือกอีเวนท์ (ไม่บังคับ)" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.event_name}>{e.event_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>จำนวนวัน</Label>
                  <Input type="number" min={0.5} step={0.5} value={createForm.days_worked} onChange={(e) => setCreateForm((p) => ({ ...p, days_worked: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>ค่าแรง/วัน</Label>
                  <Input type="number" min={0} value={createForm.daily_rate} onChange={(e) => setCreateForm((p) => ({ ...p, daily_rate: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>วันเริ่มงาน</Label>
                  <Input type="date" value={createForm.work_start_date} onChange={(e) => setCreateForm((p) => ({ ...p, work_start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>วันสิ้นสุด</Label>
                  <Input type="date" value={createForm.work_end_date} onChange={(e) => setCreateForm((p) => ({ ...p, work_end_date: e.target.value }))} />
                </div>
              </div>

              {/* WHT Mode */}
              <div>
                <Label>โหมดคำนวณภาษี</Label>
                <RadioGroup value={createForm.wht_mode} onValueChange={(v) => setCreateForm((p) => ({ ...p, wht_mode: v as any }))} className="flex gap-4 mt-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="inclusive" id="wht-inc" />
                    <Label htmlFor="wht-inc" className="font-normal">รวมภาษีแล้ว</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="exclusive" id="wht-exc" />
                    <Label htmlFor="wht-exc" className="font-normal">ไม่รวมภาษี</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Calculation Summary */}
              {createForm.daily_rate > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>ฐานค่าแรง ({createForm.days_worked} × {createForm.daily_rate.toLocaleString()})</span>
                    <span>{createBaseAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Gross (บันทึกค่าใช้จ่าย)</span>
                    <span>{createGross.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-destructive">
                    <span>หัก ณ ที่จ่าย 3%</span>
                    <span>-{createWht.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-primary border-t pt-1">
                    <span>Net (ยอดโอน)</span>
                    <span>{createNet.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div>
                <Label>หมายเหตุ</Label>
                <Textarea value={createForm.notes} onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>

              <Button className="w-full" onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending || !createForm.staff_id}>
                {createInvoiceMutation.isPending ? "กำลังบันทึก..." : "สร้างรายการ"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* LINE Chat Dialog */}
        <Dialog open={!!lineDialog} onOpenChange={(open) => { if (!open) { setLineDialog(null); setLineMessage(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                แชท LINE - {lineDialog?.staffName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>ข้อความ</Label>
                <Textarea
                  value={lineMessage}
                  onChange={(e) => setLineMessage(e.target.value)}
                  rows={4}
                  placeholder="พิมพ์ข้อความหรือวางลิงก์เอกสาร..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLineMessage((prev) => prev + (prev ? "\n" : "") + window.location.origin + "/portal?view=staff-invoice&owner=" + user?.id)}
                >
                  📎 แนบลิงก์ฟอร์มเรียกเก็บ
                </Button>
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => lineDialog?.lineUserId && sendLineMutation.mutate({ lineUserId: lineDialog.lineUserId, message: lineMessage })}
                disabled={sendLineMutation.isPending || !lineMessage.trim()}
              >
                {sendLineMutation.isPending ? "กำลังส่ง..." : "ส่งข้อความ LINE"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default StaffPayments;
