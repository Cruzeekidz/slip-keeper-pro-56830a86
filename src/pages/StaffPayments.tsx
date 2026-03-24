import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CreditCard, CheckCircle, Trash2, FileText, Gift } from "lucide-react";
import jsPDF from "jspdf";

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

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["staff-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoices")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account, tax_id, email, address)")
        .order("created_at", { ascending: false });
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

  const generateWhtCert = (inv: any) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Header
    doc.setFontSize(16);
    doc.text("Withholding Tax Certificate", 105, 20, { align: "center" });
    doc.text("(Phor.Ngor.Dor. 3)", 105, 28, { align: "center" });
    doc.setFontSize(10);
    doc.text("No.: " + inv.invoice_number, 150, 40);

    // Payer info
    doc.setFontSize(11);
    doc.text("Payer:", 20, 55);
    doc.text("(Company Name)", 50, 55);

    // Payee info
    doc.text("Payee:", 20, 70);
    doc.text(inv.staff_profiles?.staff_name || "-", 50, 70);
    doc.text("Tax ID:", 20, 78);
    doc.text(inv.staff_profiles?.tax_id || "-", 50, 78);
    doc.text("Address:", 20, 86);
    doc.text(inv.staff_profiles?.address || "-", 50, 86);

    // Table
    const y = 105;
    doc.setFontSize(10);
    doc.rect(20, y, 170, 8);
    doc.text("Type of Income", 25, y + 6);
    doc.text("Amount Paid", 110, y + 6);
    doc.text("WHT Amount", 150, y + 6);

    doc.rect(20, y + 8, 170, 10);
    doc.text("40(2) Service Fee / Freelance", 25, y + 14);
    doc.text(Number(inv.gross_amount).toLocaleString(), 120, y + 14, { align: "right" });
    doc.text(Number(inv.wht_amount).toLocaleString(), 170, y + 14, { align: "right" });

    // Total
    doc.rect(20, y + 18, 170, 10);
    doc.setFont(undefined as any, "bold");
    doc.text("Total", 25, y + 24);
    doc.text(Number(inv.gross_amount).toLocaleString(), 120, y + 24, { align: "right" });
    doc.text(Number(inv.wht_amount).toLocaleString(), 170, y + 24, { align: "right" });

    // WHT rate
    doc.setFont(undefined as any, "normal");
    doc.text(`WHT Rate: ${inv.wht_rate}%`, 20, y + 40);
    doc.text(`Event: ${inv.event_name || "-"}`, 20, y + 48);
    doc.text(`Work Period: ${inv.work_start_date || "-"} to ${inv.work_end_date || "-"}`, 20, y + 56);

    // Signatures
    const sigY = y + 80;
    doc.text("Signature (Payer)", 50, sigY, { align: "center" });
    doc.line(25, sigY - 5, 75, sigY - 5);
    doc.text("Signature (Payee)", 155, sigY, { align: "center" });
    doc.line(130, sigY - 5, 180, sigY - 5);

    doc.text(`Date: _______________`, 50, sigY + 10, { align: "center" });
    doc.text(`Date: _______________`, 155, sigY + 10, { align: "center" });

    doc.save(`WHT-${inv.invoice_number}.pdf`);
    toast({ title: "สร้างเอกสารหัก ณ ที่จ่ายสำเร็จ" });
  };

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
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ค่าแรงรวม</p>
              <p className="text-xl font-bold">{totalGross.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">หัก ณ ที่จ่าย</p>
              <p className="text-xl font-bold text-destructive">{totalWht.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">ยอดจ่ายสุทธิ</p>
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
                      <TableHead>ทีมงาน</TableHead>
                      <TableHead>อีเวนท์</TableHead>
                      <TableHead className="text-right">วัน</TableHead>
                      <TableHead className="text-right">ค่าแรง/วัน</TableHead>
                      <TableHead className="text-right">โบนัส</TableHead>
                      <TableHead className="text-right">รวม</TableHead>
                      <TableHead className="text-right">หัก 3%</TableHead>
                      <TableHead className="text-right">สุทธิ</TableHead>
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
                            {inv.staff_profiles?.tax_id && (
                              <Button size="sm" variant="outline" onClick={() => generateWhtCert(inv)} title="สร้างเอกสารหัก ณ ที่จ่าย">
                                <FileText className="h-3 w-3 mr-1" />หัก ณ ที่จ่าย
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
      </main>
    </div>
  );
};

export default StaffPayments;
