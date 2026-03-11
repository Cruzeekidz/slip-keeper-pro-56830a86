import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { FileText, TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

export function MonthlyQuickStats() {
  const [slipCount, setSlipCount] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [needsReview, setNeedsReview] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const { data, error } = await supabase
        .from('expenses')
        .select('amount, transaction_type, needs_review')
        .gte('expense_date', startOfMonth);

      if (error) throw error;

      const nonTransfer = data?.filter(e => e.transaction_type !== 'TRANSFER') || [];
      setSlipCount(nonTransfer.length);
      setMonthlyExpense(nonTransfer.reduce((sum, e) => sum + e.amount, 0));
      setNeedsReview(data?.filter(e => e.needs_review).length || 0);
    } catch (error) {
      console.error('Error fetching monthly stats:', error);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useExpensesRealtime(fetchStats);

  const monthName = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{monthName}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4 border-0 bg-gradient-card shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">สลิปเดือนนี้</p>
              <p className="text-lg font-bold text-foreground">{slipCount} รายการ</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-card shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-expense/20 text-expense flex items-center justify-center">
              <TrendingDown className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ค่าใช้จ่าย</p>
              <p className="text-lg font-bold text-foreground">฿{monthlyExpense.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        {needsReview > 0 && (
          <Card className="p-4 border-0 bg-warning/10 border-warning/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-warning/20 text-warning flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ต้องตรวจสอบ</p>
                <p className="text-lg font-bold text-foreground">{needsReview} รายการ</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
