import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, AlertTriangle, Receipt, CheckCircle, History, BellOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface DupExpense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  expense_date: string;
  expense_time: string | null;
  merchant: string | null;
  sender: string | null;
  receiver: string | null;
  transaction_id: string | null;
  receipt_url: string | null;
  created_at: string;
  non_duplicate_pairs: string[] | null;
}

interface DuplicateGroup {
  group_key: string;
  reason: string;
  items: DupExpense[];
  total_groups: number;
}

const PAGE_SIZE = 25;

export default function DuplicateChecker() {
  const [mode, setMode] = useState<"exact" | "recurring">("exact");
  const [days, setDays] = useState<number>(90);
  const [hideRecurring, setHideRecurring] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["duplicate-groups", mode, days, hideRecurring, page],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_duplicate_groups", {
        p_mode: mode,
        p_days: days,
        p_hide_recurring: hideRecurring,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DuplicateGroup[];
    },
  });

  const groups = data ?? [];
  const totalGroups = groups[0]?.total_groups ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalGroups) / PAGE_SIZE));

  const switchMode = (m: "exact" | "recurring") => {
    setMode(m);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectAllInGroup = (group: DuplicateGroup, keepFirst = true) => {
    const next = new Set(selectedIds);
    group.items.forEach((exp, index) => {
      if (keepFirst && index === 0) next.delete(exp.id);
      else next.add(exp.id);
    });
    setSelectedIds(next);
  };

  const markAsNotDuplicate = async (group: DuplicateGroup) => {
    try {
      const pairKeys: string[] = [];
      for (let i = 0; i < group.items.length; i++) {
        for (let j = i + 1; j < group.items.length; j++) {
          pairKeys.push(`${group.items[i].id}-${group.items[j].id}`);
        }
      }
      for (const expense of group.items) {
        const updated = Array.from(new Set([...(expense.non_duplicate_pairs || []), ...pairKeys]));
        const { error } = await supabase.from("expenses").update({ non_duplicate_pairs: updated }).eq("id", expense.id);
        if (error) throw error;
      }
      toast({ title: "บันทึกสำเร็จ", description: "ทำเครื่องหมายว่ารายการเหล่านี้ไม่ซ้ำกันแล้ว" });
      refetch();
    } catch (error) {
      console.error("Error marking as non-duplicate:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกได้", variant: "destructive" });
    }
  };

  const muteRecurringPayee = async (group: DuplicateGroup) => {
    const receiver = group.items[0]?.receiver || group.items[0]?.merchant;
    if (!receiver || !user) return;
    const { error } = await supabase
      .from("recurring_payees")
      .upsert({ user_id: user.id, receiver_name: receiver }, { onConflict: "user_id,receiver_name" });
    if (error) {
      toast({ title: "เกิดข้อผิดพลาด", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "บันทึกเป็นจ่ายประจำแล้ว", description: `"${receiver}" จะไม่ถูกเตือนอีก` });
    refetch();
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "ไม่มีรายการที่เลือก", description: "กรุณาเลือกรายการที่ต้องการลบ", variant: "destructive" });
      return;
    }
    if (!confirm(`คุณต้องการลบรายการที่เลือก ${selectedIds.size} รายการใช่หรือไม่? (ระบบจะสำรองไว้ในประวัติการลบ)`)) return;

    setDeleting(true);
    try {
      const { data: deletedCount, error } = await supabase.rpc("delete_expenses_with_reason", {
        p_ids: Array.from(selectedIds),
        p_reason: mode === "exact" ? "ลบจากหน้าตรวจสอบรายการซ้ำ (รายการซ้ำ)" : "ลบจากหน้าตรวจสอบรายการซ้ำ (จ่ายซ้ำที่ควรตรวจ)",
      });
      if (error) throw error;

      toast({ title: "ลบสำเร็จ", description: `ลบ ${deletedCount ?? selectedIds.size} รายการแล้ว กู้คืนได้ที่ "ประวัติการลบ"` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["pending-counts"] });
      refetch();
    } catch (error: any) {
      console.error("Error deleting expenses:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: error?.message || "ไม่สามารถลบรายการได้", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const viewReceipt = async (receiptUrl: string) => {
    try {
      const urlParts = receiptUrl.split("/");
      const filePath = urlParts.length > 1 && urlParts.includes("receipts")
        ? urlParts.slice(urlParts.indexOf("receipts") + 1).join("/")
        : receiptUrl;
      const { data, error } = await supabase.storage.from("receipts").createSignedUrl(filePath, 60);
      if (error) throw error;
      if (data?.signedUrl) setViewingReceipt(data.signedUrl);
    } catch (error) {
      console.error("Error viewing receipt:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถแสดงสลิปได้", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">ตรวจสอบรายการซ้ำซ้อน</h1>
            <p className="text-muted-foreground text-sm">
              {isLoading ? "กำลังค้นหา..." : `พบ ${totalGroups} กลุ่ม (แสดงหน้า ${page}/${totalPages})`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/deleted-history")}>
              <History className="h-4 w-4 mr-2" />
              ประวัติการลบ
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={deleteSelected} disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                ลบที่เลือก ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => switchMode(v as "exact" | "recurring")}>
          <TabsList>
            <TabsTrigger value="exact">รายการซ้ำ</TabsTrigger>
            <TabsTrigger value="recurring">จ่ายซ้ำที่ควรตรวจ</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "recurring" && (
          <Card className="p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">ช่วงเวลา</Label>
              <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90 วันล่าสุด</SelectItem>
                  <SelectItem value="180">180 วันล่าสุด</SelectItem>
                  <SelectItem value="365">1 ปีล่าสุด</SelectItem>
                  <SelectItem value="3650">ทั้งหมด</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <Checkbox checked={hideRecurring} onCheckedChange={(v) => { setHideRecurring(!!v); setPage(1); }} />
              <span className="text-sm">ซ่อนผู้รับที่ทำเครื่องหมาย "จ่ายประจำ"</span>
            </label>
          </Card>
        )}

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">กำลังค้นหารายการซ้ำ...</p>
        ) : groups.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-xl font-semibold mb-2">ไม่พบรายการที่ต้องตรวจ</h3>
            <p className="text-muted-foreground">ข้อมูลในช่วงที่เลือกดูเรียบร้อยแล้ว</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <Card key={group.group_key} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className={`text-base font-semibold flex items-center gap-2 ${mode === "recurring" ? "text-yellow-600" : "text-orange-600"}`}>
                      <AlertTriangle className="h-5 w-5" />
                      {group.reason}
                    </h3>
                    <p className="text-sm text-muted-foreground">พบ {group.items.length} รายการ</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mode === "recurring" && (
                      <Button variant="outline" size="sm" onClick={() => muteRecurringPayee(group)}>
                        <BellOff className="h-4 w-4 mr-2" />
                        จ่ายประจำ ไม่ต้องเตือนอีก
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => markAsNotDuplicate(group)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      ไม่ซ้ำกัน
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => selectAllInGroup(group, true)}>
                      เลือกทั้งหมด (เว้นรายการแรก)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => selectAllInGroup(group, false)}>
                      เลือกทั้งหมด
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {group.items.map((expense, index) => (
                    <div
                      key={expense.id}
                      className={`p-4 rounded-lg border-2 ${selectedIds.has(expense.id) ? "border-destructive bg-destructive/10" : "border-border bg-muted/50"}`}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox checked={selectedIds.has(expense.id)} onCheckedChange={() => toggleSelection(expense.id)} className="mt-1" />
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-7 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">ลำดับ</p>
                            <p className="font-medium">#{index + 1}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">จำนวนเงิน</p>
                            <p className="font-semibold text-expense">฿{Number(expense.amount).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">วันที่</p>
                            <p>{format(new Date(expense.expense_date), "dd/MM/yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">เวลา</p>
                            <p>{expense.expense_time || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">รายละเอียด</p>
                            <p className="truncate">{expense.description || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">ผู้รับโอน</p>
                            <p className="text-sm">{expense.receiver || expense.merchant || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">รหัสอ้างอิง</p>
                            <p className="text-xs truncate">{expense.transaction_id || "-"}</p>
                          </div>
                        </div>
                        {expense.receipt_url && (
                          <Button variant="outline" size="sm" onClick={() => viewReceipt(expense.receipt_url!)} className="shrink-0">
                            <Receipt className="h-4 w-4 mr-1" />
                            ดูสลิป
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
              </Button>
              <span className="text-sm text-muted-foreground">หน้า {page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                ถัดไป <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Card className="p-6 bg-muted/40">
          <h4 className="font-semibold mb-2">💡 คำแนะนำ</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• <strong>แท็บ "รายการซ้ำ"</strong> = ซ้ำจริง (รหัสอ้างอิงเดียวกัน หรือ ยอด+วันที่+เวลาตรงกันทุกประการ)</li>
            <li>• <strong>แท็บ "จ่ายซ้ำที่ควรตรวจ"</strong> = ผู้รับเดียวกัน ยอดเท่ากัน คนละวัน (ค่าเช่า/เงินเดือนจะติดด้วย)</li>
            <li>• ค่าเช่า เงินเดือน ค่าเน็ต ให้กด "จ่ายประจำ ไม่ต้องเตือนอีก" เพื่อซ่อนถาวรต่อผู้รับ</li>
            <li>• ทุกการลบจะถูกสำรองไว้ที่ "ประวัติการลบ" และกู้คืนได้</li>
          </ul>
        </Card>

        <Dialog open={!!viewingReceipt} onOpenChange={() => setViewingReceipt(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
            <DialogDescription>รายละเอียดสลิปการโอนเงิน</DialogDescription>
            {viewingReceipt && <img src={viewingReceipt} alt="Receipt" className="w-full h-auto" />}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
