import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RotateCcw, Trash2, Receipt, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeletedExpense {
  id: string;
  original_expense_id: string;
  amount: number;
  category: string;
  subcategory: string | null;
  project: string | null;
  description: string | null;
  expense_date: string;
  expense_time: string | null;
  merchant: string | null;
  sender: string | null;
  receiver: string | null;
  transaction_id: string | null;
  receipt_url: string | null;
  deleted_at: string;
  deleted_reason: string | null;
  can_restore: boolean;
  user_id: string;
}

export default function DeletedHistory() {
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<DeletedExpense | null>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchDeletedExpenses();
    }
  }, [user]);

  const fetchDeletedExpenses = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deleted_expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setDeletedExpenses(data || []);
    } catch (error) {
      console.error('Error fetching deleted expenses:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลดประวัติการลบได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const restoreExpense = async (deletedExpense: DeletedExpense) => {
    try {
      // Insert back into expenses table
      const { error: insertError } = await supabase
        .from('expenses')
        .insert({
          amount: deletedExpense.amount,
          category: deletedExpense.category,
          subcategory: deletedExpense.subcategory,
          project: deletedExpense.project,
          description: deletedExpense.description,
          expense_date: deletedExpense.expense_date,
          expense_time: deletedExpense.expense_time,
          merchant: deletedExpense.merchant,
          sender: deletedExpense.sender,
          receiver: deletedExpense.receiver,
          transaction_id: deletedExpense.transaction_id,
          receipt_url: deletedExpense.receipt_url,
          user_id: user?.id,
        });

      if (insertError) throw insertError;

      // Remove from deleted_expenses
      const { error: deleteError } = await supabase
        .from('deleted_expenses')
        .delete()
        .eq('id', deletedExpense.id);

      if (deleteError) throw deleteError;

      toast({
        title: "กู้คืนสำเร็จ",
        description: "กู้คืนรายการเรียบร้อยแล้ว",
      });

      fetchDeletedExpenses();
    } catch (error) {
      console.error('Error restoring expense:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถกู้คืนรายการได้",
        variant: "destructive",
      });
    } finally {
      setRestoreConfirm(null);
    }
  };

  const permanentDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('deleted_expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "ลบถาวรสำเร็จ",
        description: "ลบรายการออกจากประวัติเรียบร้อยแล้ว",
      });

      fetchDeletedExpenses();
    } catch (error) {
      console.error('Error permanently deleting:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบรายการได้",
        variant: "destructive",
      });
    } finally {
      setPermanentDeleteConfirm(null);
    }
  };

  const viewReceipt = async (receiptUrl: string | null) => {
    if (!receiptUrl) {
      toast({
        title: "ไม่มีสลิป",
        description: "รายการนี้ไม่มีสลิปแนบ",
        variant: "destructive",
      });
      return;
    }

    try {
      const path = receiptUrl.replace('receipts/', '');
      const { data, error } = await supabase
        .storage
        .from('receipts')
        .createSignedUrl(path, 60);

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
          <p className="text-center text-muted-foreground">กำลังโหลดประวัติ...</p>
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
            <h1 className="text-3xl font-bold text-foreground">ประวัติรายการที่ลบ</h1>
            <p className="text-muted-foreground">
              {deletedExpenses.length === 0
                ? "ไม่มีรายการที่ถูกลบ"
                : `มีรายการที่ถูกลบ ${deletedExpenses.length} รายการ`}
            </p>
          </div>
        </div>

        {deletedExpenses.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">ไม่มีประวัติรายการที่ลบ</h3>
            <p className="text-muted-foreground">
              เมื่อคุณลบรายการซ้ำ ประวัติจะแสดงที่นี่และสามารถกู้คืนได้
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {deletedExpenses.map((expense) => (
              <Card key={expense.id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">ลบเมื่อ</p>
                      <p className="font-medium text-sm">
                        {format(new Date(expense.deleted_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">วันที่ทำรายการ</p>
                      <p className="font-medium text-sm">
                        {format(new Date(expense.expense_date), 'dd/MM/yyyy')}
                        {expense.expense_time && (
                          <span className="block text-xs text-muted-foreground">
                            {expense.expense_time}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">จำนวนเงิน</p>
                      <p className="font-semibold text-expense">
                        ฿{expense.amount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ประเภท</p>
                      <p className="font-medium text-sm">{expense.category}</p>
                      {expense.subcategory && (
                        <p className="text-xs text-muted-foreground">{expense.subcategory}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ผู้ส่ง → ผู้รับ</p>
                      <p className="font-medium text-sm">
                        {expense.sender || '-'} → {expense.receiver || expense.merchant || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">รหัสอ้างอิง</p>
                      <p className="font-medium text-xs">{expense.transaction_id || '-'}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {expense.receipt_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewReceipt(expense.receipt_url)}
                        title="ดูสลิป"
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>
                    )}
                    {expense.can_restore && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoreConfirm(expense)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        กู้คืน
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPermanentDeleteConfirm(expense.id)}
                      title="ลบถาวร"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {expense.deleted_reason && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">เหตุผลที่ลบ:</p>
                    <p className="text-sm">{expense.deleted_reason}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">💡 คำแนะนำ</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• รายการที่ลบจะถูกเก็บไว้ในประวัติเพื่อให้สามารถกู้คืนได้</li>
            <li>• คุณสามารถกู้คืนรายการกลับมาได้ตลอดเวลา</li>
            <li>• หากต้องการลบถาวร ให้กดปุ่มถังขยะสีแดง</li>
            <li>• การลบถาวรจะไม่สามารถกู้คืนได้อีก</li>
          </ul>
        </Card>

        {/* Receipt Dialog */}
        <Dialog open={!!viewingReceipt} onOpenChange={() => setViewingReceipt(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
            <DialogDescription>รายละเอียดสลิปการโอนเงิน</DialogDescription>
            {viewingReceipt && (
              <img 
                src={viewingReceipt} 
                alt="Receipt" 
                className="w-full h-auto"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Restore Confirmation Dialog */}
        <AlertDialog open={!!restoreConfirm} onOpenChange={() => setRestoreConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการกู้คืนรายการ</AlertDialogTitle>
              <AlertDialogDescription>
                คุณต้องการกู้คืนรายการนี้กลับไปยังระบบหรือไม่?
                {restoreConfirm && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="font-medium">
                      ฿{restoreConfirm.amount.toLocaleString()} - {restoreConfirm.category}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(restoreConfirm.expense_date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={() => restoreConfirm && restoreExpense(restoreConfirm)}>
                กู้คืน
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Permanent Delete Confirmation Dialog */}
        <AlertDialog open={!!permanentDeleteConfirm} onOpenChange={() => setPermanentDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการลบถาวร</AlertDialogTitle>
              <AlertDialogDescription>
                คุณต้องการลบรายการนี้ถาวรหรือไม่? การลบถาวรจะไม่สามารถกู้คืนได้อีก
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => permanentDeleteConfirm && permanentDelete(permanentDeleteConfirm)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                ลบถาวร
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
