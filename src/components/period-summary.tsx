import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "lucide-react";
import { usePeriodSummaryData } from "@/hooks/useDashboardData";

type PeriodType = "month" | "year";

export function PeriodSummary() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const { periodData, isLoading } = usePeriodSummaryData(periodType);

  const formatPeriod = (period: string) => {
    if (periodType === "month") {
      const [year, month] = period.split('-');
      const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      return `${monthNames[parseInt(month) - 1]} ${parseInt(year) + 543}`;
    }
    return `ปี ${parseInt(period) + 543}`;
  };

  if (isLoading) return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">สรุปยอดตามช่วงเวลา</h2>
        </div>
        <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">ค่าใช้จ่ายจริง</TableHead>
              <TableHead className="text-right text-type-transfer">โอนเงิน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodData.map((item) => (
              <TableRow key={item.period}>
                <TableCell className="font-medium">{formatPeriod(item.period)}</TableCell>
                <TableCell className="text-right">{item.count}</TableCell>
                <TableCell className="text-right font-semibold text-expense">฿{item.totalAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right text-type-transfer">฿{item.transferAmount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
