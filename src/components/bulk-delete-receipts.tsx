import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2, AlertTriangle, FileImage, Loader2 } from "lucide-react";
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

interface MonthGroup {
  key: string; // YYYY-MM
  label: string;
  fileCount: number;
  receiptPaths: string[];
  expenseIds: string[];
}

export function BulkDeleteReceipts() {
  const [months, setMonths] = useState<MonthGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchOldReceipts();
  }, []);

  const fetchOldReceipts = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get expenses with receipts older than 5 years
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const cutoffDate = fiveYearsAgo.toISOString().split('T')[0];

      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('id, expense_date, receipt_url')
        .eq('user_id', user.id)
        .not('receipt_url', 'is', null)
        .lt('expense_date', cutoffDate)
        .order('expense_date', { ascending: true });

      if (error) throw error;
      if (!expenses || expenses.length === 0) {
        setMonths([]);
        setLoading(false);
        return;
      }

      // Group by month
      const groupMap = new Map<string, MonthGroup>();
      for (const exp of expenses) {
        const monthKey = exp.expense_date.substring(0, 7); // YYYY-MM
        if (!groupMap.has(monthKey)) {
          const [year, month] = monthKey.split('-');
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          groupMap.set(monthKey, {
            key: monthKey,
            label: `${thaiMonths[parseInt(month) - 1]} ${parseInt(year) + 543}`,
            fileCount: 0,
            receiptPaths: [],
            expenseIds: [],
          });
        }
        const group = groupMap.get(monthKey)!;
        group.fileCount++;
        group.receiptPaths.push(exp.receipt_url!);
        group.expenseIds.push(exp.id);
      }

      setMonths(Array.from(groupMap.values()));
    } catch (err) {
      console.error('Error:', err);
      toast({ title: "โหลดข้อมูลไม่สำเร็จ", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleMonth = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === months.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(months.map(m => m.key)));
    }
  };

  const totalSelected = months.filter(m => selected.has(m.key)).reduce((s, m) => s + m.fileCount, 0);

  const handleDelete = async () => {
    setShowConfirm(false);
    setDeleting(true);
    try {
      const selectedMonths = months.filter(m => selected.has(m.key));
      const allPaths = selectedMonths.flatMap(m => m.receiptPaths);
      const allExpenseIds = selectedMonths.flatMap(m => m.expenseIds);

      // Delete files from storage in batches of 100
      for (let i = 0; i < allPaths.length; i += 100) {
        const batch = allPaths.slice(i, i + 100);
        const { error } = await supabase.storage.from('receipts').remove(batch);
        if (error) console.error('Storage delete error:', error);
      }

      // Clear receipt_url from expenses (don't delete the expense records)
      for (let i = 0; i < allExpenseIds.length; i += 100) {
        const batch = allExpenseIds.slice(i, i + 100);
        const { error } = await supabase
          .from('expenses')
          .update({ receipt_url: null })
          .in('id', batch);
        if (error) console.error('Update error:', error);
      }

      toast({
        title: "ลบสลิปสำเร็จ",
        description: `ลบไฟล์สลิป ${allPaths.length} ไฟล์เรียบร้อย (ข้อมูลรายการยังคงอยู่)`,
      });

      setSelected(new Set());
      await fetchOldReceipts();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      </Card>
    );
  }

  if (months.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileImage className="h-5 w-5" />
          <p>ไม่มีสลิปที่เก่ากว่า 5 ปี</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            ลบสลิปเก่า (เกิน 5 ปี)
          </h3>
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selected.size === months.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          เลือกเดือนที่ต้องการลบไฟล์สลิป — ข้อมูลรายการจะยังคงอยู่ เฉพาะไฟล์ภาพ/PDF จะถูกลบ
        </p>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {months.map(month => (
            <label
              key={month.key}
              className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={selected.has(month.key)}
                onCheckedChange={() => toggleMonth(month.key)}
              />
              <span className="flex-1 text-sm font-medium">{month.label}</span>
              <span className="text-sm text-muted-foreground">{month.fileCount} ไฟล์</span>
            </label>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              เลือก {selected.size} เดือน ({totalSelected} ไฟล์)
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              ลบสลิปที่เลือก
            </Button>
          </div>
        )}
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ยืนยันการลบสลิป
            </AlertDialogTitle>
            <AlertDialogDescription>
              จะลบไฟล์สลิป <strong>{totalSelected}</strong> ไฟล์ จาก <strong>{selected.size}</strong> เดือน
              <br />
              <strong>ข้อมูลรายการจะยังคงอยู่</strong> เฉพาะไฟล์ภาพ/PDF จะถูกลบถาวร
              <br />
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              ลบถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
