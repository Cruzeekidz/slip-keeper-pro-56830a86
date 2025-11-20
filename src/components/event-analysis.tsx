import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProjectData {
  project: string;
  amount: number;
}

interface SubcategoryData {
  subcategory: string;
  amount: number;
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

export function EventAnalysis() {
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  const [subcategoryData, setSubcategoryData] = useState<SubcategoryData[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory !== "all") {
      fetchProjectData(selectedCategory);
      setSelectedProject("all");
      setSubcategoryData([]);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedProject !== "all" && selectedCategory !== "all") {
      fetchSubcategoryData(selectedCategory, selectedProject);
    }
  }, [selectedProject]);

  const fetchCategories = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('category');

      if (error) throw error;

      // Get unique categories
      const uniqueCategories = Array.from(new Set(
        expenses?.map(e => e.category).filter(c => c && c.trim() !== '') as string[]
      )).sort();
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectData = async (category: string) => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('project, amount, category, subcategory')
        .eq('category', category);

      if (error) throw error;

      // Get unique projects
      const uniqueProjects = Array.from(new Set(
        expenses?.map(e => e.project).filter(p => p && p.trim() !== '') as string[]
      )).sort();
      setProjects(uniqueProjects);

      // Group by project
      const projectMap = new Map<string, number>();
      expenses?.forEach(expense => {
        if (expense.project) {
          const current = projectMap.get(expense.project) || 0;
          projectMap.set(expense.project, current + expense.amount);
        }
      });

      const projectSummary: ProjectData[] = Array.from(projectMap.entries())
        .map(([project, amount]) => ({ project, amount }))
        .sort((a, b) => b.amount - a.amount);

      setProjectData(projectSummary);
    } catch (error) {
      console.error('Error fetching project data:', error);
    }
  };

  const fetchSubcategoryData = async (category: string, project: string) => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('subcategory, amount')
        .eq('category', category)
        .eq('project', project);

      if (error) throw error;

      // Group by subcategory
      const subcategoryMap = new Map<string, number>();
      expenses?.forEach(expense => {
        const subcategory = expense.subcategory || 'ไม่ระบุ';
        const current = subcategoryMap.get(subcategory) || 0;
        subcategoryMap.set(subcategory, current + expense.amount);
      });

      const subcategorySummary: SubcategoryData[] = Array.from(subcategoryMap.entries())
        .map(([subcategory, amount]) => ({ subcategory, amount }))
        .sort((a, b) => b.amount - a.amount);

      setSubcategoryData(subcategorySummary);
    } catch (error) {
      console.error('Error fetching subcategory data:', error);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </Card>
    );
  }

  const getChartConfig = (data: SubcategoryData[]) => {
    return data.reduce((acc, item, index) => {
      acc[item.subcategory] = {
        label: item.subcategory,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as Record<string, { label: string; color: string }>);
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">วิเคราะห์ค่าใช้จ่ายตามประเภท</h2>
      </div>

      {/* Category Selection */}
      <div className="mb-6">
        <Label htmlFor="category-select">ประเภท</Label>
        <Input
          id="category-select"
          value={selectedCategory === "all" ? "" : selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value || "all")}
          list="categories-datalist"
          placeholder="เลือกหรือพิมพ์ประเภท"
          className="w-full md:w-[300px] mt-2"
        />
        <datalist id="categories-datalist">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>

      {/* Project Overview Chart */}
      {selectedCategory !== "all" && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">ค่าใช้จ่ายรวมแต่ละ Project</h3>
          {projectData.length > 0 ? (
            <ChartContainer 
              config={{}} 
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <XAxis 
                    dataKey="project" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis 
                    tickFormatter={(value) => `฿${(value / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip 
                    content={
                      <ChartTooltipContent 
                        formatter={(value) => `฿${Number(value).toLocaleString()}`}
                      />
                    } 
                  />
                  <Bar dataKey="amount" fill="hsl(195 85% 45%)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              ไม่มีข้อมูล
            </div>
          )}
        </div>
      )}

      {/* Subcategory Breakdown */}
      {selectedCategory !== "all" && projects.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3">ประเภทย่อยของแต่ละ Project</h3>
            <div>
              <Label htmlFor="project-select">Project</Label>
              <Input
                id="project-select"
                value={selectedProject === "all" ? "" : selectedProject}
                onChange={(e) => setSelectedProject(e.target.value || "all")}
                list="projects-datalist"
                placeholder="เลือกหรือพิมพ์ Project"
                className="w-full md:w-[250px] mt-2"
              />
              <datalist id="projects-datalist">
                {projects.map((project) => (
                  <option key={project} value={project} />
                ))}
              </datalist>
            </div>
          </div>

          {selectedProject !== "all" && subcategoryData.length > 0 && (
            <div className="mt-6">
              <ChartContainer 
                config={getChartConfig(subcategoryData)} 
                className="h-[400px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={subcategoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ subcategory, percent }) => 
                        `${subcategory} (${(percent * 100).toFixed(0)}%)`
                      }
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {subcategoryData.map((entry, index) => (
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

              {/* Summary Table */}
              <div className="mt-6 border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-semibold">ประเภทย่อย</th>
                      <th className="text-right p-3 font-semibold">จำนวนเงิน</th>
                      <th className="text-right p-3 font-semibold">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subcategoryData.map((item, index) => {
                      const total = subcategoryData.reduce((sum, i) => sum + i.amount, 0);
                      const percentage = (item.amount / total) * 100;
                      return (
                        <tr key={index} className="border-t">
                          <td className="p-3">{item.subcategory}</td>
                          <td className="p-3 text-right font-semibold text-expense">
                            ฿{item.amount.toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t bg-muted font-bold">
                      <td className="p-3">รวม</td>
                      <td className="p-3 text-right text-expense">
                        ฿{subcategoryData.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedProject !== "all" && subcategoryData.length === 0 && (
            <div className="text-center text-muted-foreground p-8 border rounded-lg">
              ไม่มีข้อมูลประเภทย่อยสำหรับ Project นี้
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
