import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PieChartIcon, Maximize2, Minimize2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

interface CategoryData {
  name: string;
  value: number;
}

const TYPE_COLORS: Record<string, string> = {
  'TRANSFER': 'hsl(220 10% 55%)',
  'BUSINESS/EVENT': 'hsl(220 75% 55%)',
  'BUSINESS/PROGRAM': 'hsl(265 60% 55%)',
  'BUSINESS/VENUE': 'hsl(160 60% 42%)',
  'BUSINESS/GENERAL': 'hsl(185 65% 42%)',
  'BUSINESS/ENTITY_KUKANANG': 'hsl(340 65% 50%)',
  'BUSINESS/ENTITY_BCC': 'hsl(340 65% 60%)',
  'PERSONAL': 'hsl(30 90% 55%)',
};

const COLORS = [
  'hsl(220 75% 55%)', 'hsl(265 60% 55%)', 'hsl(160 60% 42%)',
  'hsl(185 65% 42%)', 'hsl(30 90% 55%)', 'hsl(220 10% 55%)',
  'hsl(142 76% 45%)', 'hsl(38 92% 50%)', 'hsl(340 65% 50%)',
];

export function CategoryChart() {
  const [chartData, setChartData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"type" | "group">("type");
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => { fetchData(); }, [viewMode]);

  useExpensesRealtime(useCallback(() => fetchData(), [viewMode]));

  const fetchData = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('transaction_type, category_group, amount, transaction_direction');
      if (error) throw error;

      const map = new Map<string, number>();
      expenses?.forEach(exp => {
        if (exp.transaction_type === 'TRANSFER') return;
        // For P&L chart, subtract income from expense
        const sign = exp.transaction_direction === 'INCOME' ? -1 : 1;
        let key: string;
        if (viewMode === "type") {
          key = exp.transaction_type || 'ไม่ระบุ';
        } else {
          if (exp.transaction_type === 'BUSINESS' && exp.category_group) {
            key = `${exp.transaction_type}/${exp.category_group}`;
          } else {
            key = exp.transaction_type || 'ไม่ระบุ';
          }
        }
        map.set(key, (map.get(key) || 0) + exp.amount * sign);
      });

      const data = Array.from(map.entries())
        .map(([name, value]) => ({ name, value: Math.abs(value) }))
        .sort((a, b) => b.value - a.value);

      setChartData(data);
    } catch (error) {
      console.error('Error fetching category data:', error);
    } finally { setLoading(false); }
  };

  if (loading) return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;

  const getColor = (name: string, index: number) => TYPE_COLORS[name] || COLORS[index % COLORS.length];

  const chartConfig = chartData.reduce((acc, item, index) => {
    acc[item.name] = { label: item.name, color: getColor(item.name, index) };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <Card className={`p-6 bg-gradient-card shadow-card transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 overflow-auto' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">การกระจายค่าใช้จ่าย (ไม่รวม TRANSFER)</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as "type" | "group")}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="type">ตามประเภทหลัก</SelectItem>
              <SelectItem value="group">ตามกลุ่มธุรกิจ</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="text-center text-muted-foreground p-4">ไม่มีข้อมูล</div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100} dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.name, index)} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `฿${Number(value).toLocaleString()}`} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </Card>
  );
}
