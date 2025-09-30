import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Calendar, Download, LogOut, Upload } from "lucide-react";
import { ExpenseUpload } from "@/components/expense-upload";
import { ExpenseListReal } from "@/components/expense-list-real";
import { StatsReal } from "@/components/stats-real";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [showUpload, setShowUpload] = useState(false);
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
                สวัสดี {user.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setShowUpload(true)}
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                เพิ่มรายการ
              </Button>
              <Button 
                onClick={() => navigate('/bulk-upload')}
                variant="outline"
                className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Upload className="h-4 w-4 mr-2" />
                อัพโหลดหลายไฟล์
              </Button>
              <Button 
                variant="outline" 
                onClick={signOut}
                className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Stats Overview */}
        <StatsReal />

        {/* Recent Transactions */}
        <ExpenseListReal />
      </main>
    </div>
  );
};

export default Index;
