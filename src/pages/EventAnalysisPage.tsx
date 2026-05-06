import { Suspense, lazy, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const EventAnalysis = lazy(() => import("@/components/event-analysis").then(m => ({ default: m.EventAnalysis })));

const EventAnalysisPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">กำไร/ขาดทุนตามอีเวนท์</h1>
            <p className="text-primary-foreground/80 text-sm">วิเคราะห์รายอีเวนท์</p>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">กำลังโหลด…</div>}>
          <EventAnalysis />
        </Suspense>
      </main>
    </div>
  );
};

export default EventAnalysisPage;
