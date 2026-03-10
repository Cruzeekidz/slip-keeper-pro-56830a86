import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

interface EventPLData {
  tag: string;
  income: number;
  expense: number;
  profit: number;
}

const COLORS = [
  'hsl(195 85% 45%)',
  'hsl(142 76% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 84% 60%)',
  'hsl(265 60% 55%)',
  'hsl(160 60% 42%)',
];

export function EventAnalysis() {
  const [eventPL, setEventPL] = useState<EventPLData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEventPL(); }, []);

  useExpensesRealtime(useCallback(() => fetchEventPL(), []));

  const fetchEventPL = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('project_tag, amount, transaction_type, category_group, transaction_direction')
        .eq('transaction_type', 'BUSINESS')
        .eq('category_group', 'EVENT')
        .not('project_tag', 'is', null);

      if (error) throw error;

      const map = new Map<string, { income: number; expense: number }>();

      expenses?.forEach(exp => {
        const tag = exp.project_tag!;
        const current = map.get(tag) || { income: 0, expense: 0 };
        if (exp.transaction_direction === 'INCOME') {
          current.income += exp.amount;
        } else {
          current.expense += exp.amount;
        }
        map.set(tag, current);
      });

      const result: EventPLData[] = Array.from(map.entries())
        .map(([tag, data]) => ({
          tag,
          income: data.income,
          expense: data.expense,
          profit: data.income - data.expense,
        }))
        .sort((a, b) => b.expense - a.expense);

      setEventPL(result);
    } catch (error) {
      console.error('Error fetching event P&L:', error);
    } finally { setLoading(false); }
  };

  if (loading) {
    return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;
  }

  if (eventPL.length === 0) {
    return null;
  }

  const chartConfig = {
    income: { label: 'รายรับ', color: 'hsl(142 76% 45%)' },
    expense: { label: 'รายจ่าย', color: 'hsl(0 84% 60%)' },
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">กำไร/ขาดทุน ตามอีเวนท์ (Event P&L)</h2>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {eventPL.map(event => (
          <Card key={event.tag} className="p-4 border">
            <div className="font-semibold text-foreground mb-2">{event.tag}</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">รายได้รวม:</span>
                <span className="font-medium text-success">฿{event.income.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ค่าใช้จ่ายรวม:</span>
                <span className="font-medium text-expense">฿{event.expense.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">กำไร/ขาดทุน:</span>
                <span className={`font-bold flex items-center gap-1 ${event.profit >= 0 ? 'text-success' : 'text-expense'}`}>
                  {event.profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  ฿{Math.abs(event.profit).toLocaleString()}
                  {event.profit >= 0 ? ' ✅' : ' ❌'}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Bar Chart */}
      <ChartContainer config={chartConfig} className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={eventPL} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <XAxis dataKey="tag" angle={-45} textAnchor="end" height={100} interval={0} />
            <YAxis tickFormatter={(value) => `฿${(value / 1000).toFixed(0)}k`} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `฿${Number(value).toLocaleString()}`} />} />
            <Legend />
            <Bar dataKey="income" name="รายรับ" fill="hsl(142 76% 45%)" />
            <Bar dataKey="expense" name="รายจ่าย" fill="hsl(0 84% 60%)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  );
}
