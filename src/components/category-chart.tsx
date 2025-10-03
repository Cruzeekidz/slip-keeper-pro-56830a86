import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PieChartIcon } from "lucide-react";

interface CategoryData {
  name: string;
  value: number;
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
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategoryData();
  }, []);

  const fetchCategoryData = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('category, amount');

      if (error) throw error;

      // Group by category
      const categoryMap = new Map<string, number>();
      
      expenses?.forEach(expense => {
        const category = expense.category;
        const current = categoryMap.get(category) || 0;
        categoryMap.set(category, current + expense.amount);
      });

      const data: CategoryData[] = Array.from(categoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      setCategoryData(data);
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

  const chartConfig = categoryData.reduce((acc, item, index) => {
    acc[item.name] = {
      label: item.name,
      color: COLORS[index % COLORS.length],
    };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">การกระจายค่าใช้จ่ายตามหมวดหมู่</h2>
      </div>
      <ChartContainer config={chartConfig} className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {categoryData.map((entry, index) => (
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
    </Card>
  );
}
