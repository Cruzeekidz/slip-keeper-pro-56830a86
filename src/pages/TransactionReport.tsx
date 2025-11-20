import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, UserCheck, Store, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface TransactionSummary {
  name: string;
  totalAmount: number;
  count: number;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

const TransactionReport = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [senderData, setSenderData] = useState<TransactionSummary[]>([]);
  const [receiverData, setReceiverData] = useState<TransactionSummary[]>([]);
  const [merchantData, setMerchantData] = useState<TransactionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;

      // Process sender data
      const senderMap = new Map<string, { totalAmount: number; count: number }>();
      expenses?.forEach(exp => {
        if (exp.sender) {
          const existing = senderMap.get(exp.sender) || { totalAmount: 0, count: 0 };
          senderMap.set(exp.sender, {
            totalAmount: existing.totalAmount + exp.amount,
            count: existing.count + 1
          });
        }
      });
      const senders = Array.from(senderMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      setSenderData(senders);

      // Process receiver data
      const receiverMap = new Map<string, { totalAmount: number; count: number }>();
      expenses?.forEach(exp => {
        if (exp.receiver) {
          const existing = receiverMap.get(exp.receiver) || { totalAmount: 0, count: 0 };
          receiverMap.set(exp.receiver, {
            totalAmount: existing.totalAmount + exp.amount,
            count: existing.count + 1
          });
        }
      });
      const receivers = Array.from(receiverMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      setReceiverData(receivers);

      // Process merchant data
      const merchantMap = new Map<string, { totalAmount: number; count: number }>();
      expenses?.forEach(exp => {
        if (exp.merchant) {
          const existing = merchantMap.get(exp.merchant) || { totalAmount: 0, count: 0 };
          merchantMap.set(exp.merchant, {
            totalAmount: existing.totalAmount + exp.amount,
            count: existing.count + 1
          });
        }
      });
      const merchants = Array.from(merchantMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      setMerchantData(merchants);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderSummaryCards = (data: TransactionSummary[], icon: any) => {
    const Icon = icon;
    const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalCount = data.reduce((sum, item) => sum + item.count, 0);

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">ยอดรวมทั้งหมด</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{formatCurrency(totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">จำนวนรายการ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalCount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">จำนวนรายชื่อ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{data.length.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>กราฟแสดงยอดรวม</CardTitle>
            <CardDescription>ยอดรวมแต่ละรายการ</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="totalAmount" fill="hsl(var(--primary))" name="ยอดรวม" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>สัดส่วนยอดเงิน</CardTitle>
            <CardDescription>สัดส่วนยอดเงินแต่ละรายการ</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={data.slice(0, 8)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={130}
                  fill="#8884d8"
                  dataKey="totalAmount"
                >
                  {data.slice(0, 8).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Detail Table */}
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียด</CardTitle>
            <CardDescription>ข้อมูลรายละเอียดทั้งหมด</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">ชื่อ</th>
                    <th className="text-right p-3 font-medium">ยอดรวม</th>
                    <th className="text-right p-3 font-medium">จำนวนรายการ</th>
                    <th className="text-right p-3 font-medium">ค่าเฉลี่ย/รายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-3 flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.name}</span>
                      </td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(item.totalAmount)}</td>
                      <td className="p-3 text-right">{item.count.toLocaleString()}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatCurrency(item.totalAmount / item.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              กลับ
            </Button>
            <div>
              <h1 className="text-2xl font-bold">รายงานธุรกรรม</h1>
              <p className="text-primary-foreground/80 mt-1">
                สรุปข้อมูลตามผู้ส่ง ผู้รับ และร้านค้า
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="senders" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="senders">
              <Send className="h-4 w-4 mr-2" />
              ผู้โอน ({senderData.length})
            </TabsTrigger>
            <TabsTrigger value="receivers">
              <UserCheck className="h-4 w-4 mr-2" />
              ผู้รับ ({receiverData.length})
            </TabsTrigger>
            <TabsTrigger value="merchants">
              <Store className="h-4 w-4 mr-2" />
              ร้านค้า ({merchantData.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="senders" className="mt-6">
            {senderData.length > 0 ? (
              renderSummaryCards(senderData, Send)
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  ไม่มีข้อมูลผู้โอน
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="receivers" className="mt-6">
            {receiverData.length > 0 ? (
              renderSummaryCards(receiverData, UserCheck)
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  ไม่มีข้อมูลผู้รับ
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="merchants" className="mt-6">
            {merchantData.length > 0 ? (
              renderSummaryCards(merchantData, Store)
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  ไม่มีข้อมูลร้านค้า
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TransactionReport;
