import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, AlertTriangle, Receipt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  expense_date: string;
  merchant: string | null;
  sender: string | null;
  receiver: string | null;
  transaction_id: string | null;
  receipt_url: string | null;
  created_at: string;
}

interface DuplicateGroup {
  key: string;
  expenses: Expense[];
  reason: string;
}

export default function DuplicateChecker() {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      findDuplicates();
    }
  }, [user]);

  const findDuplicates = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      const groups: DuplicateGroup[] = [];
      const processedIds = new Set<string>();

      // Group 1: Duplicate by transaction_id
      const transactionGroups = new Map<string, Expense[]>();
      expenses?.forEach(exp => {
        if (exp.transaction_id && !processedIds.has(exp.id)) {
          if (!transactionGroups.has(exp.transaction_id)) {
            transactionGroups.set(exp.transaction_id, []);
          }
          transactionGroups.get(exp.transaction_id)!.push(exp);
        }
      });

      transactionGroups.forEach((exps, txId) => {
        if (exps.length > 1) {
          exps.forEach(e => processedIds.add(e.id));
          groups.push({
            key: `tx-${txId}`,
            expenses: exps,
            reason: `รหัสอ้างอิงเดียวกัน: ${txId}`
          });
        }
      });

      // Group 2: Same amount + date + time
      const amountDateTimeGroups = new Map<string, Expense[]>();
      expenses?.forEach(exp => {
        if (!processedIds.has(exp.id)) {
          // ใช้ยอดโอน + วันที่และเวลา
          const key = `${exp.amount}-${exp.expense_date}`;
          if (!amountDateTimeGroups.has(key)) {
            amountDateTimeGroups.set(key, []);
          }
          amountDateTimeGroups.get(key)!.push(exp);
        }
      });

      amountDateTimeGroups.forEach((exps, key) => {
        if (exps.length > 1) {
          exps.forEach(e => processedIds.add(e.id));
          const [amount, dateTime] = key.split('-');
          groups.push({
            key: `amt-${key}`,
            expenses: exps,
            reason: `ยอดโอน วันที่ และเวลาเดียวกัน: ฿${parseFloat(amount).toLocaleString()}`
          });
        }
      });

      setDuplicateGroups(groups);
    } catch (error) {
      console.error('Error finding duplicates:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถค้นหารายการซ้ำได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAllInGroup = (group: DuplicateGroup, keepFirst: boolean = true) => {
    const newSet = new Set(selectedIds);
    group.expenses.forEach((exp, index) => {
      if (keepFirst && index === 0) {
        newSet.delete(exp.id);
      } else {
        newSet.add(exp.id);
      }
    });
    setSelectedIds(newSet);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: "ไม่มีรายการที่เลือก",
        description: "กรุณาเลือกรายการที่ต้องการลบ",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`คุณต้องการลบรายการที่เลือก ${selectedIds.size} รายการใช่หรือไม่?`)) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: "ลบสำเร็จ",
        description: `ลบรายการซ้ำ ${selectedIds.size} รายการแล้ว`,
      });

      setSelectedIds(new Set());
      await findDuplicates();
    } catch (error) {
      console.error('Error deleting expenses:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบรายการได้",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const viewReceipt = async (receiptUrl: string) => {
    try {
      // Extract the path from the full URL (remove domain if present)
      const urlParts = receiptUrl.split('/');
      const filePath = urlParts.length > 1 && urlParts.includes('receipts')
        ? urlParts.slice(urlParts.indexOf('receipts') + 1).join('/')
        : receiptUrl;

      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(filePath, 60);

      if (error) throw error;
      if (data?.signedUrl) {
        setViewingReceipt(data.signedUrl);
      }
    } catch (error) {
      console.error('Error viewing receipt:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถแสดงสลิปได้",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-muted-foreground">กำลังค้นหารายการซ้ำ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">ตรวจสอบรายการซ้ำซ้อน</h1>
            <p className="text-muted-foreground">
              {duplicateGroups.length === 0 
                ? "ไม่พบรายการซ้ำซ้อน" 
                : `พบกลุ่มรายการซ้ำ ${duplicateGroups.length} กลุ่ม`}
            </p>
          </div>
          {selectedIds.size > 0 && (
            <Button 
              variant="destructive" 
              onClick={deleteSelected}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              ลบที่เลือก ({selectedIds.size})
            </Button>
          )}
        </div>

        {duplicateGroups.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-xl font-semibold mb-2">ไม่พบรายการซ้ำซ้อน</h3>
            <p className="text-muted-foreground">ข้อมูลของคุณดูดีแล้ว ไม่มีรายการที่ซ้ำกัน</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {duplicateGroups.map((group) => (
              <Card key={group.key} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-orange-600 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      {group.reason}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      พบ {group.expenses.length} รายการที่ซ้ำกัน
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllInGroup(group, true)}
                    >
                      เลือกทั้งหมด (เว้นรายการแรก)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllInGroup(group, false)}
                    >
                      เลือกทั้งหมด
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {group.expenses.map((expense, index) => (
                    <div 
                      key={expense.id}
                      className={`p-4 rounded-lg border-2 ${
                        selectedIds.has(expense.id) 
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20' 
                          : 'border-border bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={selectedIds.has(expense.id)}
                          onCheckedChange={() => toggleSelection(expense.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-7 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">ลำดับ</p>
                            <p className="font-medium">#{index + 1}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">จำนวนเงิน</p>
                            <p className="font-semibold text-red-600">
                              ฿{expense.amount.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">วันที่</p>
                            <p>{format(new Date(expense.expense_date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">เวลา</p>
                            <p>{format(new Date(expense.expense_date), 'HH:mm:ss')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">รายละเอียด</p>
                            <p className="truncate">{expense.description || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">ผู้รับโอน</p>
                            <p className="text-sm">
                              {expense.receiver || expense.merchant || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">รหัสอ้างอิง</p>
                            <p className="text-xs truncate">{expense.transaction_id || '-'}</p>
                          </div>
                        </div>
                        {expense.receipt_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewReceipt(expense.receipt_url!)}
                            className="shrink-0"
                          >
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
          </div>
        )}

        {/* Instructions */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">💡 คำแนะนำ</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• ระบบตรวจสอบรายการซ้ำโดยเปรียบเทียบรหัสอ้างอิง (Transaction ID)</li>
            <li>• หรือเปรียบเทียบยอดโอน + วันที่ + เวลาที่เหมือนกันทุกประการ</li>
            <li>• คุณสามารถกดดูสลิปเพื่อตรวจสอบความถูกต้องก่อนลบได้</li>
            <li>• เลือกรายการที่ต้องการลบด้วยตัวเอง หรือใช้ปุ่ม "เลือกทั้งหมด (เว้นรายการแรก)"</li>
            <li>• ตรวจสอบข้อมูลให้ละเอียดก่อนลบ เพราะการลบไม่สามารถย้อนกลับได้</li>
          </ul>
        </Card>

        {/* Receipt Viewer Dialog */}
        <Dialog open={!!viewingReceipt} onOpenChange={() => setViewingReceipt(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            {viewingReceipt && (
              <img 
                src={viewingReceipt} 
                alt="Receipt" 
                className="w-full h-auto"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
