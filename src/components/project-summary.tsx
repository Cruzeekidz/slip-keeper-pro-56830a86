import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Folder } from "lucide-react";

interface ProjectSummaryData {
  tag: string;
  totalAmount: number;
  count: number;
}

export function ProjectSummary() {
  const [projectData, setProjectData] = useState<ProjectSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewBy, setViewBy] = useState<"project_tag" | "category_group">("project_tag");

  useEffect(() => {
    fetchSummary();
  }, [viewBy]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('project_tag, category_group, transaction_type, amount');

      if (error) throw error;

      const map = new Map<string, { totalAmount: number; count: number }>();

      expenses?.forEach(expense => {
        if (expense.transaction_type === 'TRANSFER') return;

        const key = viewBy === "project_tag"
          ? expense.project_tag || 'ไม่ระบุแท็ก'
          : expense.transaction_type === 'BUSINESS'
            ? expense.category_group || 'ไม่ระบุกลุ่ม'
            : expense.transaction_type || 'ไม่ระบุ';

        const current = map.get(key) || { totalAmount: 0, count: 0 };
        map.set(key, { totalAmount: current.totalAmount + expense.amount, count: current.count + 1 });
      });

      const summaries = Array.from(map.entries())
        .map(([tag, data]) => ({ tag, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      setProjectData(summaries);
    } catch (error) {
      console.error('Error fetching project summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">สรุปยอด (ไม่รวม TRANSFER)</h2>
        </div>
        <Select value={viewBy} onValueChange={(v) => setViewBy(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="project_tag">ตามแท็กโปรเจค</SelectItem>
            <SelectItem value="category_group">ตามกลุ่ม</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{viewBy === "project_tag" ? "แท็กโปรเจค" : "กลุ่ม"}</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectData.map((item) => (
              <TableRow key={item.tag}>
                <TableCell className="font-medium">{item.tag}</TableCell>
                <TableCell className="text-right">{item.count}</TableCell>
                <TableCell className="text-right font-semibold text-expense">฿{item.totalAmount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
