import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "lucide-react";

interface PeriodData {
  period: string;
  totalAmount: number;
  count: number;
}

type PeriodType = "month" | "year";

export function PeriodSummary() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodData, setPeriodData] = useState<PeriodData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPeriodSummary();
  }, [periodType]);

  const fetchPeriodSummary = async () => {
    setLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('expense_date, amount')
        .order('expense_date', { ascending: false });

      if (error) throw error;

      const periodMap = new Map<string, { totalAmount: number; count: number }>();

      expenses?.forEach(expense => {
        const date = new Date(expense.expense_date);
        let periodKey: string;

        if (periodType === "month") {
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
          periodKey = String(date.getFullYear());
        }

        const current = periodMap.get(periodKey) || { totalAmount: 0, count: 0 };
        periodMap.set(periodKey, {
          totalAmount: current.totalAmount + expense.amount,
          count: current.count + 1
        });
      });

      const summaries: PeriodData[] = Array.from(periodMap.entries()).map(([period, data]) => ({
        period,
        totalAmount: data.totalAmount,
        count: data.count
      })).sort((a, b) => b.period.localeCompare(a.period));

      setPeriodData(summaries);
    } catch (error) {
      console.error('Error fetching period summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPeriod = (period: string) => {
    if (periodType === "month") {
      const [year, month] = period.split('-');
      const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", 
                          "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      return `${monthNames[parseInt(month) - 1]} ${parseInt(year) + 543}`;
    }
    return `ปี ${parseInt(period) + 543}`;
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
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">สรุปยอดตามช่วงเวลา</h2>
        </div>
        <Select value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">รายเดือน</SelectItem>
            <SelectItem value="year">รายปี</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ช่วงเวลา</TableHead>
              <TableHead className="text-right">จำนวนรายการ</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodData.map((item) => (
              <TableRow key={item.period}>
                <TableCell className="font-medium">{formatPeriod(item.period)}</TableCell>
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
