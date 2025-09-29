import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/ui/stats-card";
import { ExpenseUpload } from "@/components/expense-upload";
import { ExpenseList } from "@/components/expense-list";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Plus,
  Receipt,
  PieChart,
  Calendar,
  FileText
} from "lucide-react";

const Index = () => {
  const [showUpload, setShowUpload] = useState(false);

  if (showUpload) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <ExpenseUpload onClose={() => setShowUpload(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-primary text-primary-foreground p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">จัดการค่าใช้จ่าย</h1>
              <p className="text-primary-foreground/80 mt-1">
                ระบบบันทึกรายรับ-รายจ่าย และจัดการใบเสร็จ
              </p>
            </div>
            <Button 
              onClick={() => setShowUpload(true)}
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มรายการ
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="รายรับรวม"
            value="฿45,250"
            icon={<TrendingUp className="h-6 w-6" />}
            trend="+12.5% จากเดือนก่อน"
            trendUp={true}
            variant="income"
          />
          <StatsCard
            title="รายจ่ายรวม"
            value="฿18,750"
            icon={<TrendingDown className="h-6 w-6" />}
            trend="+5.2% จากเดือนก่อน"
            trendUp={false}
            variant="expense"
          />
          <StatsCard
            title="กำไรสุทธิ"
            value="฿26,500"
            icon={<Wallet className="h-6 w-6" />}
            trend="+18.3% จากเดือนก่อน"
            trendUp={true}
          />
          <StatsCard
            title="รายการทั้งหมด"
            value="124"
            icon={<Receipt className="h-6 w-6" />}
            trend="32 รายการใหม่"
            trendUp={true}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button 
            variant="outline" 
            className="h-20 flex-col gap-2"
            onClick={() => setShowUpload(true)}
          >
            <Receipt className="h-6 w-6" />
            <span>เพิ่มใบเสร็จ</span>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2">
            <PieChart className="h-6 w-6" />
            <span>รายงาน</span>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2">
            <Calendar className="h-6 w-6" />
            <span>ตารางเวลา</span>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2">
            <FileText className="h-6 w-6" />
            <span>ส่งออกข้อมูล</span>
          </Button>
        </div>

        {/* Recent Transactions */}
        <ExpenseList />
      </main>
    </div>
  );
};

export default Index;
