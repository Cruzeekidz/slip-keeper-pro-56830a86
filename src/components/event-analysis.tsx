import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, TrendingUp, TrendingDown, Loader2, RefreshCw } from "lucide-react";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";
import { useToast } from "@/hooks/use-toast";

const READYGO_CACHE_KEY = 'readygo_revenue_cache';
const READYGO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface ReadyGoCache {
  timestamp: number;
  data: Record<string, { registrationRevenue: number; otoRevenue: number; readyGoOtherIncome: number }>;
}

function getReadyGoCache(): ReadyGoCache | null {
  try {
    const raw = localStorage.getItem(READYGO_CACHE_KEY);
    if (!raw) return null;
    const cache: ReadyGoCache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > READYGO_CACHE_TTL) {
      localStorage.removeItem(READYGO_CACHE_KEY);
      return null;
    }
    return cache;
  } catch { return null; }
}

function setReadyGoCache(data: Record<string, { registrationRevenue: number; otoRevenue: number; readyGoOtherIncome: number }>) {
  localStorage.setItem(READYGO_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
}

interface EventPLData {
  tag: string;
  displayName: string;
  income: number;
  expense: number;
  profit: number;
  hasReadyGoData: boolean;
  eventDate: string | null;
}

interface EventRegistryItem {
  id: string;
  event_name: string;
  aliases: string[];
  event_date: string | null;
  project_tag: string;
  is_active: boolean;
  readygo_event_id: string | null;
}

interface EventGroup {
  id: string;
  group_name: string;
  project_tag: string;
  readygo_event_ids: string[];
  festival_date: string | null;
}

interface EventAnalysisProps {
  recentOnly?: boolean;
}

export function EventAnalysis({ recentOnly = false }: EventAnalysisProps) {
  const [eventPL, setEventPL] = useState<EventPLData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheTime, setCacheTime] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => { fetchEventPL(false); }, []);
  useExpensesRealtime(useCallback(() => fetchEventPL(false), []));

  const handleForceRefresh = async () => {
    setRefreshing(true);
    localStorage.removeItem(READYGO_CACHE_KEY);
    await fetchEventPL(true);
    setRefreshing(false);
    toast({ title: "รีเฟรชสำเร็จ", description: "ดึงข้อมูลรายได้จาก Ready-go ใหม่แล้ว" });
  };

  const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');

  const fetchEventPL = async (forceRefresh = false) => {
    try {
      // Fetch registry, expenses, event groups, and other income in parallel
      const [registryRes, expensesRes, groupsRes, otherIncomeRes, productCostsRes] = await Promise.all([
        supabase.from('event_registry').select('*'),
        supabase.from('expenses')
          .select('project_tag, event_name, amount, transaction_type, category_group, transaction_direction')
          .eq('transaction_type', 'BUSINESS')
          .eq('category_group', 'EVENT'),
        supabase.from('event_groups').select('*'),
        supabase.from('event_other_income').select('*'),
        supabase.from('event_product_costs' as any).select('*'),
      ]);

      const registry = (registryRes.data as EventRegistryItem[]) || [];
      const expenses = expensesRes.data || [];
      const groups = (groupsRes.data as EventGroup[]) || [];
      const otherIncomes = (otherIncomeRes.data as any[]) || [];
      const productCostsData = (productCostsRes.data as any[]) || [];

      // Filter recent events if needed
      let activeRegistry = registry.filter(r => r.is_active);
      if (recentOnly) {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 3, 28);
        activeRegistry = activeRegistry.filter(r => {
          if (!r.event_date) return true;
          const d = new Date(r.event_date);
          return d >= threeMonthsAgo && d <= threeMonthsAhead;
        });
      }

      // Build alias lookup
      const aliasMap = new Map<string, string>();
      const tagDisplayName = new Map<string, string>();

      activeRegistry.forEach(r => {
        tagDisplayName.set(r.project_tag, r.event_name);
        aliasMap.set(normalizeForMatch(r.project_tag), r.project_tag);
        aliasMap.set(normalizeForMatch(r.event_name), r.project_tag);
        r.aliases.forEach(a => {
          aliasMap.set(normalizeForMatch(a), r.project_tag);
        });
      });

      // Aggregate local expenses
      const map = new Map<string, { income: number; expense: number }>();

      expenses.forEach(exp => {
        let resolvedTag = exp.project_tag || exp.event_name || null;
        if (!resolvedTag) return;

        const normalized = normalizeForMatch(resolvedTag);
        const registryTag = aliasMap.get(normalized);
        const finalTag = registryTag || resolvedTag;

        const current = map.get(finalTag) || { income: 0, expense: 0 };
        if (exp.transaction_direction === 'INCOME') {
          current.income += exp.amount;
        } else {
          current.expense += exp.amount;
        }
        map.set(finalTag, current);
      });

      // Ready-go revenue: use cache unless forceRefresh
      const groupsWithIds = groups.filter(g => g.readygo_event_ids?.length > 0);
      // Also collect registry entries with readygo_event_id (single events without a group)
      const registryWithReadyGo = activeRegistry.filter(r => r.readygo_event_id && !groups.some(g => g.project_tag === r.project_tag));
      const readyGoRevenueMap = new Map<string, { registrationRevenue: number; otoRevenue: number; readyGoOtherIncome: number }>();

      const cached = forceRefresh ? null : getReadyGoCache();

      if (cached && (groupsWithIds.length > 0 || registryWithReadyGo.length > 0)) {
        // Use cached data
        for (const [tag, val] of Object.entries(cached.data)) {
          readyGoRevenueMap.set(tag, val);
        }
        setCacheTime(new Date(cached.timestamp).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
      } else if (groupsWithIds.length > 0 || registryWithReadyGo.length > 0) {
        // Fetch fresh from API — groups (multi-event)
        const fetchPromises = groupsWithIds.map(async (group) => {
          try {
            const action = group.readygo_event_ids.length === 1 
              ? "event-financials" 
              : "multi-event-financials";
            const body = group.readygo_event_ids.length === 1
              ? { action, event_id: group.readygo_event_ids[0] }
              : { action, event_ids: group.readygo_event_ids };

            const { data, error } = await supabase.functions.invoke("fetch-readygo-data", { body });
            if (error) throw error;

            const stats = data?.registrationStats || {};
            readyGoRevenueMap.set(group.project_tag, {
              registrationRevenue: Number(stats.actual_revenue || 0),
              otoRevenue: Number(stats.total_oto_revenue || 0),
              readyGoOtherIncome: Number(data?.summary?.totalOtherIncome || 0),
            });
          } catch (err) {
            console.error(`Failed to fetch Ready-go data for group ${group.group_name}:`, err);
          }
        });

        // Fetch fresh from API — single registry entries
        const registryFetchPromises = registryWithReadyGo.map(async (reg) => {
          try {
            const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
              body: { action: "event-financials", event_id: reg.readygo_event_id },
            });
            if (error) throw error;

            const stats = data?.registrationStats || {};
            readyGoRevenueMap.set(reg.project_tag, {
              registrationRevenue: Number(stats.actual_revenue || 0),
              otoRevenue: Number(stats.total_oto_revenue || 0),
              readyGoOtherIncome: Number(data?.summary?.totalOtherIncome || 0),
            });
          } catch (err) {
            console.error(`Failed to fetch Ready-go data for ${reg.event_name}:`, err);
          }
        });

        await Promise.allSettled([...fetchPromises, ...registryFetchPromises]);

        // Save to cache
        const cacheObj: Record<string, { registrationRevenue: number; otoRevenue: number; readyGoOtherIncome: number }> = {};
        readyGoRevenueMap.forEach((v, k) => { cacheObj[k] = v; });
        setReadyGoCache(cacheObj);
        setCacheTime(new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
      }

      // Add other income from event_other_income table per group
      const manualOtherIncomeByTag = new Map<string, number>();
      for (const group of groups) {
        const groupIncomes = otherIncomes.filter(i => i.event_group_id === group.id);
        const total = groupIncomes.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
        if (total > 0) {
          manualOtherIncomeByTag.set(group.project_tag, (manualOtherIncomeByTag.get(group.project_tag) || 0) + total);
        }
      }

      // Aggregate product costs per group
      const productCostByTag = new Map<string, number>();
      for (const group of groups) {
        const groupCosts = productCostsData.filter((c: any) => c.event_group_id === group.id);
        const total = groupCosts.reduce((s: number, c: any) => s + Number(c.quantity || 0) * Number(c.unit_cost || 0), 0);
        if (total > 0) {
          productCostByTag.set(group.project_tag, (productCostByTag.get(group.project_tag) || 0) + total);
        }
      }

      // Build a date lookup from registry first
      const tagDateMap = new Map<string, string | null>();
      activeRegistry.forEach(r => tagDateMap.set(r.project_tag, r.event_date));

      // Merge Ready-go revenue into the map and collect festival dates
      for (const group of groups) {
        const tag = group.project_tag;
        const current = map.get(tag) || { income: 0, expense: 0 };
        const readyGo = readyGoRevenueMap.get(tag);
        const manualOther = manualOtherIncomeByTag.get(tag) || 0;
        const productCost = productCostByTag.get(tag) || 0;

        if (readyGo) {
          current.income += readyGo.registrationRevenue + readyGo.otoRevenue + readyGo.readyGoOtherIncome;
        }
        current.income += manualOther;
        current.expense += productCost;

        // Use festival_date from group if available (overrides registry date)
        if (group.festival_date) {
          tagDateMap.set(tag, group.festival_date);
        }

        // Also set display name from group if not in registry
        if (!tagDisplayName.has(tag)) {
          tagDisplayName.set(tag, group.group_name);
        }

        map.set(tag, current);
      }

      // Filter and build result
      if (recentOnly) {
        const activeTags = new Set(activeRegistry.map(r => r.project_tag));
        // Also include group tags
        groups.forEach(g => activeTags.add(g.project_tag));
        const entries = Array.from(map.entries()).filter(([tag]) => activeTags.has(tag));
        map.clear();
        entries.forEach(([k, v]) => map.set(k, v));
      }

      const groupTagSet = new Set(groups.map(g => g.project_tag));

      const result: EventPLData[] = Array.from(map.entries())
        .map(([tag, data]) => ({
          tag,
          displayName: tagDisplayName.get(tag) || tag,
          income: data.income,
          expense: data.expense,
          profit: data.income - data.expense,
          hasReadyGoData: readyGoRevenueMap.has(tag) || groupTagSet.has(tag),
          eventDate: tagDateMap.get(tag) || null,
        }))
        .sort((a, b) => {
          // Sort by event date descending (newest first), null dates go last
          if (a.eventDate && b.eventDate) return b.eventDate.localeCompare(a.eventDate);
          if (a.eventDate && !b.eventDate) return -1;
          if (!a.eventDate && b.eventDate) return 1;
          return b.expense - a.expense;
        });

      setEventPL(result);
    } catch (error) {
      console.error('Error fetching event P&L:', error);
    } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p>กำลังโหลดข้อมูล P&L อีเวนท์...</p>
        </div>
      </Card>
    );
  }

  if (eventPL.length === 0) return null;

  const chartConfig = {
    income: { label: 'รายรับ', color: 'hsl(142 76% 45%)' },
    expense: { label: 'รายจ่าย', color: 'hsl(0 84% 60%)' },
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">
            กำไร/ขาดทุน ตามอีเวนท์
            {recentOnly && <span className="text-sm font-normal text-muted-foreground ml-2">(ล่าสุด)</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {cacheTime && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              ข้อมูลรายได้ ณ {cacheTime}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRefresh}
            disabled={refreshing}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'กำลังดึง...' : 'ดึงรายได้ใหม่'}
          </Button>
        </div>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {eventPL.map(event => (
          <Card key={event.tag} className="p-4 border">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-foreground">{event.displayName}</span>
              {event.hasReadyGoData && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  Ready-go
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              {event.displayName !== event.tag && (
                <span className="text-xs text-muted-foreground font-mono">{event.tag}</span>
              )}
              {event.eventDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(event.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
              )}
            </div>
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
