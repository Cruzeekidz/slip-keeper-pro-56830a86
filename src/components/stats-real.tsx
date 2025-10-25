import { useState, useEffect } from "react";
import { StatsCard } from "@/components/ui/stats-card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function StatsReal() {
  const [stats, setStats] = useState({
    currentYearExpenses: 0,
    lastYearExpenses: 0,
    currentYearTransfers: 0,
    lastYearTransfers: 0,
    monthlyExpenses: 0,
    expenseCount: 0,
    monthlyChange: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get all expenses with category
      const { data: allExpenses, error: allError } = await supabase
        .from('expenses')
        .select('amount, expense_date, category');

      if (allError) throw allError;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastYear = currentYear - 1;
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // Calculate current year expenses (excluding transfers)
      const currentYearExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === currentYear && expense.category !== 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate last year expenses (excluding transfers)
      const lastYearExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === lastYear && expense.category !== 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate current year transfers
      const currentYearTransfers = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === currentYear && expense.category === 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate last year transfers
      const lastYearTransfers = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === lastYear && expense.category === 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate current month expenses (excluding transfers)
      const currentMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getMonth() === currentMonth && 
               expenseDate.getFullYear() === currentYear && 
               expense.category !== 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate last month expenses (excluding transfers)
      const lastMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getMonth() === lastMonth && 
               expenseDate.getFullYear() === lastMonthYear && 
               expense.category !== 'การโอนเงินระหว่างบัญชี';
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate monthly change percentage
      const monthlyChange = lastMonthExpenses > 0 
        ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100
        : 0;

      // Count only non-transfer expenses
      const expenseCount = allExpenses?.filter(expense => expense.category !== 'การโอนเงินระหว่างบัญชี').length || 0;

      setStats({
        currentYearExpenses,
        lastYearExpenses,
        currentYearTransfers,
        lastYearTransfers,
        monthlyExpenses: currentMonthExpenses,
        expenseCount,
        monthlyChange
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  return (
    <div className="space-y-6">
      {/* Current Year Stats */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {currentYear + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="รายจ่ายรวมปีนี้"
            value={`฿${stats.currentYearExpenses.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend={`ไม่รวมการโอนเงิน`}
            trendUp={true}
            variant="expense"
          />
          
          <StatsCard
            title="การโอนเงินระหว่างบัญชี"
            value={`฿${stats.currentYearTransfers.toLocaleString()}`}
            icon={<TrendingUp className="h-6 w-6" />}
            trend="แยกจากรายจ่าย"
            trendUp={true}
          />
          
          <StatsCard
            title="รายจ่ายเดือนนี้"
            value={`฿${stats.monthlyExpenses.toLocaleString()}`}
            icon={<TrendingDown className="h-6 w-6" />}
            trend={`${Math.abs(stats.monthlyChange).toFixed(1)}% ${stats.monthlyChange > 0 ? "เพิ่มขึ้น" : "ลดลง"}จากเดือนที่แล้ว`}
            trendUp={stats.monthlyChange <= 0}
            variant="expense"
          />
          
          <StatsCard
            title="จำนวนรายการ"
            value={stats.expenseCount.toString()}
            icon={<ShoppingCart className="h-6 w-6" />}
            trend="รายการทั้งหมด (ไม่รวมโอนเงิน)"
            trendUp={true}
          />
        </div>
      </div>

      {/* Last Year Stats */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {lastYear + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="รายจ่ายรวมปีที่แล้ว"
            value={`฿${stats.lastYearExpenses.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend={`ไม่รวมการโอนเงิน`}
            trendUp={true}
            variant="expense"
          />
          
          <StatsCard
            title="การโอนเงินระหว่างบัญชี"
            value={`฿${stats.lastYearTransfers.toLocaleString()}`}
            icon={<TrendingUp className="h-6 w-6" />}
            trend="แยกจากรายจ่าย"
            trendUp={true}
          />
          
          <StatsCard
            title="เปรียบเทียบกับปีนี้"
            value={`${stats.lastYearExpenses > 0 ? ((stats.currentYearExpenses - stats.lastYearExpenses) / stats.lastYearExpenses * 100).toFixed(1) : '0'}%`}
            icon={<TrendingUp className="h-6 w-6" />}
            trend={stats.currentYearExpenses > stats.lastYearExpenses ? "เพิ่มขึ้น" : "ลดลง"}
            trendUp={stats.currentYearExpenses <= stats.lastYearExpenses}
          />
        </div>
      </div>
    </div>
  );
}