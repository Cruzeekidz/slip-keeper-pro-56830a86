import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────
export interface ExpenseRow {
  id: string;
  amount: number;
  expense_date: string;
  transaction_type: string | null;
  transaction_direction: string;
  category_group: string | null;
  needs_review: boolean | null;
  project_tag: string | null;
  receipt_url: string | null;
  description: string | null;
  merchant: string | null;
  subcategory: string | null;
}

const EXPENSES_QUERY_KEY = ["expenses-dashboard"];

// ─── Paginated fetch (handles >1000 rows) ────────────────────
async function fetchAllExpenses(): Promise<ExpenseRow[]> {
  const PAGE_SIZE = 1000;
  let all: ExpenseRow[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("expenses")
      .select(
        "id, amount, expense_date, transaction_type, transaction_direction, category_group, needs_review, project_tag, receipt_url, description, merchant, subcategory"
      )
      .range(from, from + PAGE_SIZE - 1)
      .order("expense_date", { ascending: false });

    if (error) throw error;
    all = all.concat((data as ExpenseRow[]) || []);
    done = !data || data.length < PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

// ─── Core hook: single query powering all dashboard cards ────
export function useDashboardExpenses() {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: EXPENSES_QUERY_KEY,
    queryFn: fetchAllExpenses,
  });

  // Realtime → invalidate
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return result;
}

// ─── Derived: MonthlyQuickStats ──────────────────────────────
export function useMonthlyQuickStats() {
  const { data: expenses, isLoading } = useDashboardExpenses();

  return useMemo(() => {
    if (!expenses) return { slipCount: 0, businessExpense: 0, personalExpense: 0, needsReview: 0, isLoading };

    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthExpenses = expenses.filter((e) => e.expense_date >= startOfMonth);

    const nonTransfer = monthExpenses.filter((e) => e.transaction_type !== "TRANSFER");
    const expenseOnly = nonTransfer.filter((e) => e.transaction_direction !== "INCOME");

    return {
      slipCount: nonTransfer.length,
      businessExpense: expenseOnly
        .filter((e) => e.transaction_type === "BUSINESS")
        .reduce((s, e) => s + e.amount, 0),
      personalExpense: expenseOnly
        .filter((e) => e.transaction_type === "PERSONAL")
        .reduce((s, e) => s + e.amount, 0),
      needsReview: monthExpenses.filter((e) => e.needs_review).length,
      isLoading,
    };
  }, [expenses, isLoading]);
}

// ─── Derived: StatsReal ──────────────────────────────────────
export function useStatsReal() {
  const { data: expenses, isLoading } = useDashboardExpenses();

  return useMemo(() => {
    if (!expenses)
      return {
        currentYearBusiness: 0, currentYearPersonal: 0, currentYearTransfers: 0,
        lastYearBusiness: 0, lastYearPersonal: 0, lastYearTransfers: 0,
        monthlyExpenses: 0, expenseCount: 0, monthlyChange: 0, needsReviewCount: 0,
        isLoading,
      };

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const byYearType = (year: number, type: string) =>
      expenses
        .filter((e) => new Date(e.expense_date).getFullYear() === year && e.transaction_type === type)
        .reduce((s, e) => s + e.amount, 0);

    const currentMonthExpenses = expenses
      .filter((e) => {
        const d = new Date(e.expense_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.transaction_type !== "TRANSFER";
      })
      .reduce((s, e) => s + e.amount, 0);

    const lastMonthExpenses = expenses
      .filter((e) => {
        const d = new Date(e.expense_date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear && e.transaction_type !== "TRANSFER";
      })
      .reduce((s, e) => s + e.amount, 0);

    const monthlyChange = lastMonthExpenses > 0 ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100 : 0;
    const expenseCount = expenses.filter((e) => e.transaction_type !== "TRANSFER").length;
    const needsReviewCount = expenses.filter((e) => e.needs_review).length;

    return {
      currentYearBusiness: byYearType(currentYear, "BUSINESS"),
      currentYearPersonal: byYearType(currentYear, "PERSONAL"),
      currentYearTransfers: byYearType(currentYear, "TRANSFER"),
      lastYearBusiness: byYearType(lastYear, "BUSINESS"),
      lastYearPersonal: byYearType(lastYear, "PERSONAL"),
      lastYearTransfers: byYearType(lastYear, "TRANSFER"),
      monthlyExpenses: currentMonthExpenses,
      expenseCount,
      monthlyChange,
      needsReviewCount,
      isLoading,
    };
  }, [expenses, isLoading]);
}

// ─── Derived: CategoryChart ──────────────────────────────────
export function useCategoryChartData(viewMode: "type" | "group") {
  const { data: expenses, isLoading } = useDashboardExpenses();

  return useMemo(() => {
    if (!expenses) return { chartData: [], isLoading };

    const map = new Map<string, number>();
    expenses.forEach((exp) => {
      if (exp.transaction_type === "TRANSFER") return;
      const sign = exp.transaction_direction === "INCOME" ? -1 : 1;
      let key: string;
      if (viewMode === "type") {
        key = exp.transaction_type || "ไม่ระบุ";
      } else {
        if (exp.transaction_type === "BUSINESS" && exp.category_group) {
          key = `${exp.transaction_type}/${exp.category_group}`;
        } else {
          key = exp.transaction_type || "ไม่ระบุ";
        }
      }
      map.set(key, (map.get(key) || 0) + exp.amount * sign);
    });

    const chartData = Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.abs(value) }))
      .sort((a, b) => b.value - a.value);

    return { chartData, isLoading };
  }, [expenses, isLoading, viewMode]);
}

// ─── Derived: PeriodSummary ──────────────────────────────────
export function usePeriodSummaryData(periodType: "month" | "year") {
  const { data: expenses, isLoading } = useDashboardExpenses();

  return useMemo(() => {
    if (!expenses) return { periodData: [], isLoading };

    const periodMap = new Map<string, { totalAmount: number; transferAmount: number; count: number }>();
    expenses.forEach((expense) => {
      const date = new Date(expense.expense_date);
      const periodKey =
        periodType === "month"
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
          : String(date.getFullYear());

      const current = periodMap.get(periodKey) || { totalAmount: 0, transferAmount: 0, count: 0 };
      if (expense.transaction_type === "TRANSFER") {
        current.transferAmount += expense.amount;
      } else {
        current.totalAmount += expense.amount;
      }
      current.count += 1;
      periodMap.set(periodKey, current);
    });

    const periodData = Array.from(periodMap.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => b.period.localeCompare(a.period));

    return { periodData, isLoading };
  }, [expenses, isLoading, periodType]);
}

// ─── Derived: ProjectSummary ─────────────────────────────────
export function useProjectSummaryData(
  viewBy: "project_tag" | "category_group",
  dateFrom: string | null,
  dateTo: string | null
) {
  const { data: expenses, isLoading } = useDashboardExpenses();

  return useMemo(() => {
    if (!expenses) return { projectData: [], grandTotal: 0, grandCount: 0, isLoading };

    const map = new Map<string, { totalAmount: number; count: number }>();
    expenses.forEach((expense) => {
      if (expense.transaction_type === "TRANSFER") return;
      if (dateFrom && expense.expense_date < dateFrom) return;
      if (dateTo && expense.expense_date > dateTo) return;

      const key =
        viewBy === "project_tag"
          ? expense.project_tag || "ไม่ระบุแท็ก"
          : expense.transaction_type === "BUSINESS"
          ? expense.category_group || "ไม่ระบุกลุ่ม"
          : expense.transaction_type || "ไม่ระบุ";

      const current = map.get(key) || { totalAmount: 0, count: 0 };
      map.set(key, { totalAmount: current.totalAmount + expense.amount, count: current.count + 1 });
    });

    const projectData = Array.from(map.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const grandTotal = projectData.reduce((s, d) => s + d.totalAmount, 0);
    const grandCount = projectData.reduce((s, d) => s + d.count, 0);

    return { projectData, grandTotal, grandCount, isLoading };
  }, [expenses, isLoading, viewBy, dateFrom, dateTo]);
}

// ─── Storage stats (separate query — not from expenses) ──────
export function useStorageStats() {
  return useQuery({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { totalFiles: 0, totalSize: 0 };

      const { data: expenses, error } = await supabase
        .from("expenses")
        .select("receipt_url")
        .eq("user_id", user.id)
        .not("receipt_url", "is", null);

      if (error) throw error;
      const totalFiles = expenses?.length || 0;

      let totalSize = 0;
      if (totalFiles > 0) {
        const { data: fileList, error: listError } = await supabase.storage
          .from("receipts")
          .list(user.id, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

        if (!listError && fileList) {
          totalSize = fileList.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
        }
      }

      return { totalFiles, totalSize };
    },
  });
}
