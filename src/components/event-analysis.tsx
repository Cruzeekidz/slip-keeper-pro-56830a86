import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

interface EventPLData {
  tag: string;
  displayName: string;
  income: number;
  expense: number;
  profit: number;
}

interface EventRegistryItem {
  id: string;
  event_name: string;
  aliases: string[];
  event_date: string | null;
  project_tag: string;
  is_active: boolean;
}

interface EventAnalysisProps {
  recentOnly?: boolean; // true = show only events within 3 months of now
}

export function EventAnalysis({ recentOnly = false }: EventAnalysisProps) {
  const [eventPL, setEventPL] = useState<EventPLData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEventPL(); }, []);
  useExpensesRealtime(useCallback(() => fetchEventPL(), []));

  const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

  const fetchEventPL = async () => {
    try {
      // Fetch event registry and expenses in parallel
      const [registryRes, expensesRes] = await Promise.all([
        supabase.from('event_registry').select('*'),
        supabase.from('expenses')
          .select('project_tag, event_name, amount, transaction_type, category_group, transaction_direction')
          .eq('transaction_type', 'BUSINESS')
          .eq('category_group', 'EVENT'),
      ]);

      const registry = (registryRes.data as EventRegistryItem[]) || [];
      const expenses = expensesRes.data || [];

      // Filter recent events if needed (event_date within 3 months)
      let activeRegistry = registry.filter(r => r.is_active);
      if (recentOnly) {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 3, 28);
        activeRegistry = activeRegistry.filter(r => {
          if (!r.event_date) return true; // no date = always show
          const d = new Date(r.event_date);
          return d >= threeMonthsAgo && d <= threeMonthsAhead;
        });
      }

      // Build alias lookup: normalized alias -> project_tag
      const aliasMap = new Map<string, string>();
      const tagDisplayName = new Map<string, string>();

      activeRegistry.forEach(r => {
        tagDisplayName.set(r.project_tag, r.event_name);
        // Map the project_tag itself
        aliasMap.set(normalizeForMatch(r.project_tag), r.project_tag);
        aliasMap.set(normalizeForMatch(r.event_name), r.project_tag);
        r.aliases.forEach(a => {
          aliasMap.set(normalizeForMatch(a), r.project_tag);
        });
      });

      // Aggregate expenses, normalizing tags via registry
      const map = new Map<string, { income: number; expense: number }>();

      expenses.forEach(exp => {
        // Try to match via project_tag or event_name
        let resolvedTag = exp.project_tag || exp.event_name || null;
        if (!resolvedTag) return;

        const normalized = normalizeForMatch(resolvedTag);
        const registryTag = aliasMap.get(normalized);
        const finalTag = registryTag || resolvedTag;

        // If recentOnly and this tag is not in the active registry, check if we should skip
        if (recentOnly && !tagDisplayName.has(finalTag) && registryTag === undefined) {
          // Not in registry at all - still show it (legacy data)
        }

        const current = map.get(finalTag) || { income: 0, expense: 0 };
        if (exp.transaction_direction === 'INCOME') {
          current.income += exp.amount;
        } else {
          current.expense += exp.amount;
        }
        map.set(finalTag, current);
      });

      // If recentOnly, filter to only registry tags
      let entries = Array.from(map.entries());
      if (recentOnly && activeRegistry.length > 0) {
        const activeTags = new Set(activeRegistry.map(r => r.project_tag));
        entries = entries.filter(([tag]) => activeTags.has(tag));
      }

      const result: EventPLData[] = entries
        .map(([tag, data]) => ({
          tag,
          displayName: tagDisplayName.get(tag) || tag,
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

  if (eventPL.length === 0) return null;

  const chartConfig = {
    income: { label: 'รายรับ', color: 'hsl(142 76% 45%)' },
    expense: { label: 'รายจ่าย', color: 'hsl(0 84% 60%)' },
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">
          กำไร/ขาดทุน ตามอีเวนท์
          {recentOnly && <span className="text-sm font-normal text-muted-foreground ml-2">(ล่าสุด)</span>}
        </h2>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {eventPL.map(event => (
          <Card key={event.tag} className="p-4 border">
            <div className="font-semibold text-foreground mb-1">{event.displayName}</div>
            {event.displayName !== event.tag && (
              <p className="text-xs text-muted-foreground mb-2 font-mono">{event.tag}</p>
            )}
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
            <XAxis dataKey="displayName" angle={-45} textAnchor="end" height={100} interval={0} />
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
