import { useState, useEffect, useCallback } from "react";
import { StatsCard } from "@/components/ui/stats-card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

export function StatsReal() {
  const [stats, setStats] = useState({
    currentYearBusiness: 0,
    currentYearPersonal: 0,
    currentYearTransfers: 0,
    lastYearBusiness: 0,
    lastYearPersonal: 0,
    lastYearTransfers: 0,
    monthlyExpenses: 0,
    expenseCount: 0,
    monthlyChange: 0,
    needsReviewCount: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  useExpensesRealtime(useCallback(() => fetchStats(), []));

  const fetchStats = async () => {
    try {
      const { data: allExpenses, error } = await supabase
        .from('expenses')
        .select('amount, expense_date, transaction_type, needs_review');

      if (error) throw error;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastYear = currentYear - 1;
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const byYearType = (year: number, type: string) =>
        allExpenses?.filter(e => new Date(e.expense_date).getFullYear() === year && e.transaction_type === type)
          .reduce((sum, e) => sum + e.amount, 0) || 0;

      const currentMonthExpenses = allExpenses?.filter(e => {
        const d = new Date(e.expense_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.transaction_type !== 'TRANSFER';
      }).reduce((sum, e) => sum + e.amount, 0) || 0;

      const lastMonthExpenses = allExpenses?.filter(e => {
        const d = new Date(e.expense_date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear && e.transaction_type !== 'TRANSFER';
      }).reduce((sum, e) => sum + e.amount, 0) || 0;

      const monthlyChange = lastMonthExpenses > 0
        ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100 : 0;

      const expenseCount = allExpenses?.filter(e => e.transaction_type !== 'TRANSFER').length || 0;
      const needsReviewCount = allExpenses?.filter(e => e.needs_review).length || 0;

      setStats({
        currentYearBusiness: byYearType(currentYear, 'BUSINESS'),
        currentYearPersonal: byYearType(currentYear, 'PERSONAL'),
        currentYearTransfers: byYearType(currentYear, 'TRANSFER'),
        lastYearBusiness: byYearType(lastYear, 'BUSINESS'),
        lastYearPersonal: byYearType(lastYear, 'PERSONAL'),
        lastYearTransfers: byYearType(lastYear, 'TRANSFER'),
        monthlyExpenses: currentMonthExpenses,
        expenseCount,
        monthlyChange,
        needsReviewCount,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {currentYear + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="ค่าใช้จ่ายธุรกิจ"
            value={`฿${stats.currentYearBusiness.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend="BUSINESS"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="ค่าใช้จ่ายส่วนตัว"
            value={`฿${stats.currentYearPersonal.toLocaleString()}`}
            icon={<ShoppingCart className="h-6 w-6" />}
            trend="PERSONAL"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="การโอนเงิน"
            value={`฿${stats.currentYearTransfers.toLocaleString()}`}
            icon={<ArrowRightLeft className="h-6 w-6" />}
            trend="TRANSFER (ไม่นับใน P&L)"
            trendUp={true}
          />
          <StatsCard
            title="รายจ่ายเดือนนี้"
            value={`฿${stats.monthlyExpenses.toLocaleString()}`}
            icon={<TrendingDown className="h-6 w-6" />}
            trend={`${Math.abs(stats.monthlyChange).toFixed(1)}% ${stats.monthlyChange > 0 ? "เพิ่มขึ้น" : "ลดลง"}`}
            trendUp={stats.monthlyChange <= 0}
            variant="expense"
          />
        </div>
      </div>

      {stats.needsReviewCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <span className="text-sm font-medium text-foreground">
            มี {stats.needsReviewCount} รายการที่ต้องตรวจสอบการจัดหมวดหมู่
          </span>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {(currentYear - 1) + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatsCard
            title="ค่าใช้จ่ายธุรกิจ"
            value={`฿${stats.lastYearBusiness.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend="BUSINESS"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="ค่าใช้จ่ายส่วนตัว"
            value={`฿${stats.lastYearPersonal.toLocaleString()}`}
            icon={<ShoppingCart className="h-6 w-6" />}
            trend="PERSONAL"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="การโอนเงิน"
            value={`฿${stats.lastYearTransfers.toLocaleString()}`}
            icon={<ArrowRightLeft className="h-6 w-6" />}
            trend="TRANSFER"
            trendUp={true}
          />
        </div>
      </div>
    </div>
  );
}
