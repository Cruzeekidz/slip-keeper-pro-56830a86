import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { StatsReal } from "@/components/stats-real";
import { StorageStats } from "@/components/storage-stats";
import { BulkDeleteReceipts } from "@/components/bulk-delete-receipts";
import { CategoryChart } from "@/components/category-chart";
import { EventAnalysis } from "@/components/event-analysis";
import { ProjectSummary } from "@/components/project-summary";
import { PeriodSummary } from "@/components/period-summary";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-primary-foreground hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">สรุปภาพรวม</h1>
            <p className="text-primary-foreground/80 text-sm">สถิติ กราฟ และรายงานสรุป</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <StatsReal />
        <StorageStats />
        <BulkDeleteReceipts />
        <CategoryChart />
        <EventAnalysis />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProjectSummary />
          <PeriodSummary />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
