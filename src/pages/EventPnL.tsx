import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, TrendingUp, TrendingDown, Users, DollarSign, Package, RefreshCw, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ReadyGoEvent {
  id: string;
  title: string;
  short_code: string;
  event_date: string;
  location: string;
}

interface RegistrationStats {
  total_registrations: number;
  completed_count: number;
  sponsored_count: number;
  total_registration_fee: number;
  total_discount: number;
  total_cruzee_discount: number;
  actual_revenue: number;
  oto1_revenue: number;
  oto1_count: number;
  oto2_revenue: number;
  oto2_count: number;
  total_oto_revenue: number;
  category_breakdown: Record<string, number>;
}

interface EventFinancialData {
  event: ReadyGoEvent;
  registrationStats: RegistrationStats;
  financials: any[];
  summary: {
    totalExpenses: number;
    totalOtherIncome: number;
    netProfit: number;
  };
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 50%, 45%)",
];

const formatNumber = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0 });

const EventPnL = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [events, setEvents] = useState<ReadyGoEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [financialData, setFinancialData] = useState<EventFinancialData | null>(null);
  const [localExpenses, setLocalExpenses] = useState<number>(0);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchEvents();
  }, [user]);

  useEffect(() => {
    if (selectedEventId && financialData) fetchLocalExpenses();
  }, [selectedEventId, financialData]);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "list-events" },
      });
      if (error) throw error;
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
      toast({ title: "ไม่สามารถดึงรายการอีเวนท์ได้", variant: "destructive" });
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchFinancials = async (eventId: string) => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "event-financials", event_id: eventId },
      });
      if (error) throw error;
      setFinancialData(data);
    } catch (err) {
      console.error(err);
      toast({ title: "ไม่สามารถดึงข้อมูลการเงินได้", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  const fetchLocalExpenses = async () => {
    if (!financialData?.event || !user) return;
    const eventTitle = financialData.event.title;
    const { data } = await supabase
      .from("expenses")
      .select("amount")
      .eq("user_id", user.id)
      .or(`event_name.ilike.%${eventTitle}%,project.ilike.%${eventTitle}%`);
    
    const total = (data || []).reduce((s, e) => s + Number(e.amount), 0);
    setLocalExpenses(total);
  };

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    fetchFinancials(eventId);
  };

  if (authLoading || !user) return null;

  const stats = financialData?.registrationStats;
  const summary = financialData?.summary;

  // Chart data
  const revenueBreakdown = stats ? [
    { name: "ค่าสมัคร", value: Number(stats.actual_revenue || 0) },
    { name: "OTO1", value: Number(stats.oto1_revenue || 0) },
    { name: "OTO2", value: Number(stats.oto2_revenue || 0) },
    ...(summary?.totalOtherIncome ? [{ name: "รายได้อื่น", value: Number(summary.totalOtherIncome) }] : []),
  ].filter(d => d.value > 0) : [];

  const categoryData = stats?.category_breakdown
    ? Object.entries(stats.category_breakdown).map(([name, value]) => ({ name, value: Number(value) }))
    : [];

  const totalRevenue = Number(stats?.actual_revenue || 0) + Number(stats?.total_oto_revenue || 0) + Number(summary?.totalOtherIncome || 0);
  const totalCost = Number(summary?.totalExpenses || 0) + Number(localExpenses || 0);
  const combinedProfit = totalRevenue - totalCost;

  const pnlBarData = [
    { name: "รายได้", รายได้: totalRevenue, ค่าใช้จ่าย: 0, กำไร: 0, ขาดทุน: 0 },
    { name: "ค่าใช้จ่าย", รายได้: 0, ค่าใช้จ่าย: totalCost, กำไร: 0, ขาดทุน: 0 },
    { name: "กำไร/ขาดทุน", รายได้: 0, ค่าใช้จ่าย: 0, กำไร: combinedProfit > 0 ? combinedProfit : 0, ขาดทุน: combinedProfit < 0 ? Math.abs(combinedProfit) : 0 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">P&L อีเวนท์ (Ready-go.fun)</h1>
            <p className="text-primary-foreground/80 text-sm">รายได้จากค่าสมัคร OTO และค่าใช้จ่ายรวม</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Event Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">เลือกอีเวนท์</label>
                <Select value={selectedEventId} onValueChange={handleEventSelect} disabled={loadingEvents}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingEvents ? "กำลังโหลด..." : "เลือกอีเวนท์จาก Ready-go.fun"} />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.title} — {ev.event_date ? new Date(ev.event_date).toLocaleDateString("th-TH") : "ไม่มีวันที่"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => selectedEventId && fetchFinancials(selectedEventId)} disabled={!selectedEventId || loadingData}>
                <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {loadingData && (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {financialData && stats && summary && !loadingData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ผู้สมัคร</p>
                      <p className="text-xl font-bold">{stats.total_registrations}</p>
                      {stats.sponsored_count > 0 && (
                        <p className="text-xs text-muted-foreground">สปอนเซอร์ {stats.sponsored_count}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">รายได้รวม</p>
                      <p className="text-xl font-bold text-green-600">฿{formatNumber(totalRevenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ค่าใช้จ่ายรวม</p>
                      <p className="text-xl font-bold text-red-600">฿{formatNumber(totalCost)}</p>
                      {localExpenses > 0 && (
                        <p className="text-xs text-muted-foreground">จากสลิป ฿{formatNumber(localExpenses)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`bg-gradient-to-br border-0 ${combinedProfit >= 0 ? "from-green-600/10 to-green-600/5" : "from-red-600/10 to-red-600/5"}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${combinedProfit >= 0 ? "bg-green-600/20" : "bg-red-600/20"}`}>
                      <DollarSign className={`h-5 w-5 ${combinedProfit >= 0 ? "text-green-700" : "text-red-700"}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">กำไร/ขาดทุน</p>
                      <p className={`text-xl font-bold ${combinedProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {combinedProfit >= 0 ? "+" : ""}฿{formatNumber(combinedProfit)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue & OTO Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    รายละเอียดรายได้
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm">ค่าสมัคร (ก่อนส่วนลด)</span>
                    <span className="font-medium">฿{formatNumber(stats.total_registration_fee)}</span>
                  </div>
                  {stats.total_discount > 0 && (
                    <div className="flex justify-between py-2 border-b text-red-600">
                      <span className="text-sm">ส่วนลด</span>
                      <span className="font-medium">-฿{formatNumber(stats.total_discount)}</span>
                    </div>
                  )}
                  {stats.total_cruzee_discount > 0 && (
                    <div className="flex justify-between py-2 border-b text-red-600">
                      <span className="text-sm">Cruzee Discount</span>
                      <span className="font-medium">-฿{formatNumber(stats.total_cruzee_discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b font-semibold">
                    <span className="text-sm">ค่าสมัครสุทธิ</span>
                    <span className="text-green-600">฿{formatNumber(stats.actual_revenue)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" /> OTO1
                      <span className="text-xs text-muted-foreground">({stats.oto1_count} ชิ้น)</span>
                    </span>
                    <span className="font-medium">฿{formatNumber(stats.oto1_revenue)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" /> OTO2
                      <span className="text-xs text-muted-foreground">({stats.oto2_count} ชิ้น)</span>
                    </span>
                    <span className="font-medium">฿{formatNumber(stats.oto2_revenue)}</span>
                  </div>
                  {summary.totalOtherIncome > 0 && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm">รายได้อื่นๆ</span>
                      <span className="font-medium">฿{formatNumber(summary.totalOtherIncome)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 font-bold text-lg border-t-2">
                    <span>รายได้รวมทั้งหมด</span>
                    <span className="text-green-600">฿{formatNumber(totalRevenue)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">สัดส่วนรายได้</CardTitle>
                </CardHeader>
                <CardContent>
                  {revenueBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          dataKey="value"
                        >
                          {revenueBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `฿${formatNumber(v)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-12">ไม่มีข้อมูลรายได้</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* P&L Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">กราฟเปรียบเทียบ รายได้ vs ค่าใช้จ่าย</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pnlBarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `฿${formatNumber(v)}`} />
                    <Legend />
                    <Bar dataKey="รายได้" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ค่าใช้จ่าย" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="กำไร" fill="hsl(150, 70%, 40%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ขาดทุน" fill="hsl(0, 80%, 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Breakdown & Expenses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Participant Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    ผู้สมัครแยกตามประเภท
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <div className="space-y-2">
                      {categoryData
                        .sort((a, b) => b.value - a.value)
                        .map((cat, i) => (
                          <div key={cat.name} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-sm">{cat.name}</span>
                            </div>
                            <span className="font-medium">{cat.value} คน</span>
                          </div>
                        ))}
                      <div className="flex justify-between pt-3 font-bold border-t-2">
                        <span>รวม</span>
                        <span>{stats.completed_count} คน</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">ไม่มีข้อมูล</p>
                  )}
                </CardContent>
              </Card>

              {/* Expense Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingDown className="h-5 w-5" />
                    ค่าใช้จ่าย
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {summary.totalExpenses > 0 && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm">จาก Ready-go.fun</span>
                        <span className="font-medium text-red-600">฿{formatNumber(summary.totalExpenses)}</span>
                      </div>
                    )}
                    {localExpenses > 0 && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm">จากสลิป (ระบบนี้)</span>
                        <span className="font-medium text-red-600">฿{formatNumber(localExpenses)}</span>
                      </div>
                    )}
                    {(financialData.financials || [])
                      .filter(f => f.category === "expense")
                      .map((f, i) => (
                        <div key={i} className="flex justify-between py-1.5 text-sm text-muted-foreground">
                          <span>{f.description || f.subcategory || "รายจ่าย"}</span>
                          <span>฿{formatNumber(f.amount)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between pt-3 font-bold border-t-2">
                      <span>ค่าใช้จ่ายรวม</span>
                      <span className="text-red-600">฿{formatNumber(totalCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {!selectedEventId && !loadingEvents && (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">เลือกอีเวนท์ด้านบนเพื่อดูสรุป P&L</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default EventPnL;
