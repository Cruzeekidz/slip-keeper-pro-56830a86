import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PieChartIcon, Maximize2, Minimize2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface CategoryData {
  name: string;
  value: number;
}

interface YearData {
  year: number;
  categories: CategoryData[];
}

const COLORS = [
  'hsl(195 85% 45%)',   // primary
  'hsl(142 76% 45%)',   // success
  'hsl(38 92% 50%)',    // warning
  'hsl(0 84% 60%)',     // expense
  'hsl(195 25% 92%)',   // secondary
  'hsl(195 85% 55%)',   // primary-light
  'hsl(142 76% 55%)',   // success-light
  'hsl(38 92% 60%)',    // warning-light
];

export function CategoryChart() {
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>("compare");
  const [isExpanded, setIsExpanded] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchCategoryData();
  }, []);

  const fetchCategoryData = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('category, amount, expense_date');

      if (error) throw error;

      // Group by year and category (excluding transfers)
      const yearMap = new Map<number, Map<string, number>>();
      
      const isTransferCategory = (category: string) => {
        return category === 'การโอนเงินระหว่างบัญชี' || category === 'การโอนข้ามบัญชี';
      };
      
      expenses?.forEach(expense => {
        if (isTransferCategory(expense.category)) return; // Skip transfers
        
        const year = new Date(expense.expense_date).getFullYear();
        const category = expense.category;
        
        if (!yearMap.has(year)) {
          yearMap.set(year, new Map<string, number>());
        }
        
        const categoryMap = yearMap.get(year)!;
        const current = categoryMap.get(category) || 0;
        categoryMap.set(category, current + expense.amount);
      });

      const data: YearData[] = Array.from(yearMap.entries())
        .map(([year, categoryMap]) => ({
          year,
          categories: Array.from(categoryMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        }))
        .sort((a, b) => b.year - a.year);

      setYearData(data);
    } catch (error) {
      console.error('Error fetching category data:', error);
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

  const currentYearData = yearData.find(y => y.year === currentYear);
  const lastYearData = yearData.find(y => y.year === currentYear - 1);

  const getChartConfig = (categories: CategoryData[]) => {
    return categories.reduce((acc, item, index) => {
      acc[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as Record<string, { label: string; color: string }>);
  };

  const renderPieChart = (data: CategoryData[] | undefined, title: string) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-4">
          ไม่มีข้อมูล
        </div>
      );
    }

    const chartConfig = getChartConfig(data);

    return (
      <div>
        <h3 className="text-lg font-semibold mb-3 text-center">{title}</h3>
        <ChartContainer config={chartConfig} className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    formatter={(value) => `฿${Number(value).toLocaleString()}`}
                  />
                } 
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  return (
    <Card className={`p-6 bg-gradient-card shadow-card transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 overflow-auto' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">การกระจายค่าใช้จ่ายตามหมวดหมู่</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compare">เปรียบเทียบ 2 ปี</SelectItem>
              {yearData.map(({ year }) => (
                <SelectItem key={year} value={year.toString()}>
                  ปี {year + 543}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="shrink-0"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className={`transition-all duration-300 ${isExpanded ? 'h-[calc(100vh-200px)]' : ''}`}>
        {selectedYear === "compare" ? (
          <div className={`grid gap-6 ${isExpanded ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
            {renderPieChart(currentYearData?.categories, `ปี ${currentYear + 543}`)}
            {renderPieChart(lastYearData?.categories, `ปี ${currentYear - 1 + 543}`)}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {renderPieChart(
              yearData.find(y => y.year === parseInt(selectedYear))?.categories,
              `ปี ${parseInt(selectedYear) + 543}`
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
