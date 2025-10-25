import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Folder } from "lucide-react";

interface ProjectSummary {
  project: string;
  totalAmount: number;
  count: number;
}

export function ProjectSummary() {
  const [projectData, setProjectData] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  useEffect(() => {
    fetchProjectSummary();
  }, [selectedYear]);

  const isTransferCategory = (category: string) => {
    return category === 'การโอนเงินระหว่างบัญชี' || category === 'การโอนข้ามบัญชี';
  };

  const fetchProjectSummary = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('project, amount, expense_date, category');

      if (error) throw error;

      // Get unique years for the dropdown
      const years = new Set<number>();
      expenses?.forEach(expense => {
        const year = new Date(expense.expense_date).getFullYear();
        years.add(year);
      });
      setAvailableYears(Array.from(years).sort((a, b) => b - a));

      // Filter by selected year and exclude transfers
      const filteredExpenses = expenses?.filter(expense => {
        if (isTransferCategory(expense.category)) return false;
        
        if (selectedYear === "all") return true;
        const expenseYear = new Date(expense.expense_date).getFullYear();
        return expenseYear === parseInt(selectedYear);
      });

      // Group by project
      const projectMap = new Map<string, { totalAmount: number; count: number }>();
      
      filteredExpenses?.forEach(expense => {
        const projectName = expense.project || "ไม่ระบุโปรเจค";
        const current = projectMap.get(projectName) || { totalAmount: 0, count: 0 };
        projectMap.set(projectName, {
          totalAmount: current.totalAmount + expense.amount,
          count: current.count + 1
        });
      });

      const summaries: ProjectSummary[] = Array.from(projectMap.entries()).map(([project, data]) => ({
        project,
        totalAmount: data.totalAmount,
        count: data.count
      })).sort((a, b) => b.totalAmount - a.totalAmount);

      setProjectData(summaries);
    } catch (error) {
      console.error('Error fetching project summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">สรุปยอดตามโปรเจค</h2>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกปี</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                ปี {year + 543}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>โปรเจค</TableHead>
              <TableHead className="text-right">จำนวนรายการ</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectData.map((item) => (
              <TableRow key={item.project}>
                <TableCell className="font-medium">{item.project}</TableCell>
                <TableCell className="text-right">{item.count}</TableCell>
                <TableCell className="text-right font-semibold text-expense">
                  ฿{item.totalAmount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
