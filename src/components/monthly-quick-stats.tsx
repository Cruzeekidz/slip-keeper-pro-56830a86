import { Card } from "@/components/ui/card";
import { FileText, TrendingDown, AlertTriangle, Briefcase, User } from "lucide-react";
import { useMonthlyQuickStats } from "@/hooks/useDashboardData";

export function MonthlyQuickStats() {
  const { slipCount, businessExpense, personalExpense, needsReview } = useMonthlyQuickStats();

  const monthName = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const totalExpense = businessExpense + personalExpense;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{monthName}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-0 bg-gradient-card shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">สลิปเดือนนี้</p>
              <p className="text-lg font-bold text-foreground">{slipCount} <span className="text-xs font-normal">รายการ</span></p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-card shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-type-business/20 text-type-business flex items-center justify-center">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ธุรกิจ</p>
              <p className="text-lg font-bold text-foreground">฿{businessExpense.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-card shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-type-personal/20 text-type-personal flex items-center justify-center">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ส่วนตัว</p>
              <p className="text-lg font-bold text-foreground">฿{personalExpense.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        {needsReview > 0 ? (
          <Card className="p-4 border-0 bg-warning/10 border-warning/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-warning/20 text-warning flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ต้องตรวจสอบ</p>
                <p className="text-lg font-bold text-foreground">{needsReview} <span className="text-xs font-normal">รายการ</span></p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 border-0 bg-gradient-card shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-expense/20 text-expense flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">รวมค่าใช้จ่าย</p>
                <p className="text-lg font-bold text-foreground">฿{totalExpense.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
