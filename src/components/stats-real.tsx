import { useState, useEffect } from "react";
import { StatsCard } from "@/components/ui/stats-card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function StatsReal() {
  const [stats, setStats] = useState({
    totalExpenses: 0,
    monthlyExpenses: 0,
    expenseCount: 0,
    monthlyChange: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get all expenses
      const { data: allExpenses, error: allError } = await supabase
        .from('expenses')
        .select('amount, expense_date');

      if (allError) throw allError;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // Calculate total expenses
      const totalExpenses = allExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate current month expenses
      const currentMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate last month expenses
      const lastMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getMonth() === lastMonth && expenseDate.getFullYear() === lastMonthYear;
      }).reduce((sum, expense) => sum + expense.amount, 0) || 0;

      // Calculate monthly change percentage
      const monthlyChange = lastMonthExpenses > 0 
        ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100
        : 0;

      setStats({
        totalExpenses,
        monthlyExpenses: currentMonthExpenses,
        expenseCount: allExpenses?.length || 0,
        monthlyChange
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        title="รายจ่ายรวม"
        value={`฿${stats.totalExpenses.toLocaleString()}`}
        icon={<DollarSign className="h-6 w-6" />}
        trend={`${Math.abs(stats.monthlyChange).toFixed(1)}% ${stats.monthlyChange > 0 ? "เพิ่มขึ้น" : "ลดลง"}จากเดือนที่แล้ว`}
        trendUp={stats.monthlyChange <= 0}
        variant="expense"
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
        trend="รายการทั้งหมด"
        trendUp={true}
      />
      
      <StatsCard
        title="ค่าเฉลี่ยต่อรายการ"
        value={`฿${stats.expenseCount > 0 ? Math.round(stats.totalExpenses / stats.expenseCount).toLocaleString() : '0'}`}
        icon={<TrendingUp className="h-6 w-6" />}
        trend="ค่าเฉลี่ย"
        trendUp={true}
      />
    </div>
  );
}