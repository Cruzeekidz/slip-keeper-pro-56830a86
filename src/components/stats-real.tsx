import { StatsCard } from "@/components/ui/stats-card";
import { TrendingDown, DollarSign, ShoppingCart, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { useStatsReal } from "@/hooks/useDashboardData";

export function StatsReal() {
  const stats = useStatsReal();
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {currentYear + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="ค่าใช้จ่ายธุรกิจ"
            value={`฿${stats.currentYearBusiness.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend="BUSINESS"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="ค่าใช้จ่ายส่วนตัว"
            value={`฿${stats.currentYearPersonal.toLocaleString()}`}
            icon={<ShoppingCart className="h-6 w-6" />}
            trend="PERSONAL"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="การโอนเงิน"
            value={`฿${stats.currentYearTransfers.toLocaleString()}`}
            icon={<ArrowRightLeft className="h-6 w-6" />}
            trend="TRANSFER (ไม่นับใน P&L)"
            trendUp={true}
          />
          <StatsCard
            title="รายจ่ายเดือนนี้"
            value={`฿${stats.monthlyExpenses.toLocaleString()}`}
            icon={<TrendingDown className="h-6 w-6" />}
            trend={`${Math.abs(stats.monthlyChange).toFixed(1)}% ${stats.monthlyChange > 0 ? "เพิ่มขึ้น" : "ลดลง"}`}
            trendUp={stats.monthlyChange <= 0}
            variant="expense"
          />
        </div>
      </div>

      {stats.needsReviewCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <span className="text-sm font-medium text-foreground">
            มี {stats.needsReviewCount} รายการที่ต้องตรวจสอบการจัดหมวดหมู่
          </span>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">ปี {(currentYear - 1) + 543}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatsCard
            title="ค่าใช้จ่ายธุรกิจ"
            value={`฿${stats.lastYearBusiness.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            trend="BUSINESS"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="ค่าใช้จ่ายส่วนตัว"
            value={`฿${stats.lastYearPersonal.toLocaleString()}`}
            icon={<ShoppingCart className="h-6 w-6" />}
            trend="PERSONAL"
            trendUp={true}
            variant="expense"
          />
          <StatsCard
            title="การโอนเงิน"
            value={`฿${stats.lastYearTransfers.toLocaleString()}`}
            icon={<ArrowRightLeft className="h-6 w-6" />}
            trend="TRANSFER"
            trendUp={true}
          />
        </div>
      </div>
    </div>
  );
}
