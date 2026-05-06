import { useState, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Download, LogOut, Upload, Settings, Menu, LayoutDashboard, DollarSign, CreditCard, Building2, ClipboardCheck, Calendar, Wrench } from "lucide-react";
import { ExpenseUpload } from "@/components/expense-upload";
import { MonthlyQuickStats } from "@/components/monthly-quick-stats";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// Lazy-load heavy widgets so the menu/header remain responsive
const EventAnalysis = lazy(() => import("@/components/event-analysis").then(m => ({ default: m.EventAnalysis })));
const ExpenseListReal = lazy(() => import("@/components/expense-list-real").then(m => ({ default: m.ExpenseListReal })));

const Index = () => {
  const [showUpload, setShowUpload] = useState(false);
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { toast } = useToast();

  const exportToCSV = async () => {
    if (!user) return;

    try {
      // Fetch all expenses for current user
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      if (!expenses || expenses.length === 0) {
        toast({
          title: "ไม่มีข้อมูล",
          description: "ไม่มีรายการค่าใช้จ่ายให้ส่งออก",
          variant: "destructive",
        });
        return;
      }

      // Create CSV content
      const headers = ['วันที่', 'จำนวนเงิน', 'ประเภท', 'ประเภทย่อย', 'โปรเจค', 'ผู้รับเงิน', 'รายละเอียด'];
      const csvContent = [
        headers.join(','),
        ...expenses.map(exp => [
          exp.expense_date,
          exp.amount,
          exp.category,
          exp.subcategory || '',
          exp.project || '',
          exp.merchant || '',
          `"${exp.description || ''}"` // Wrap in quotes for descriptions with commas
        ].join(','))
      ].join('\n');

      // Add BOM for Thai character support in Excel
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "ส่งออกสำเร็จ",
        description: `ส่งออกข้อมูล ${expenses.length} รายการเรียบร้อย`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถส่งออกข้อมูลได้",
        variant: "destructive",
      });
    }
  };

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
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            {/* Title Section */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl md:text-2xl font-bold">จัดการค่าใช้จ่าย</h1>
                <p className="text-primary-foreground/80 mt-1 text-sm md:text-base">
                  สวัสดี {user.email}
                </p>
              </div>
              <Button 
                onClick={() => setShowUpload(true)}
                className="bg-white text-primary hover:bg-white/90 shrink-0"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">เพิ่มรายการ</span>
                <span className="sm:hidden">เพิ่ม</span>
              </Button>
            </div>

            {/* Buttons Section - Dropdown for tools */}
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-white/10 text-white border border-white/20 hover:bg-white/20 text-sm"
                size="sm"
              >
                <LayoutDashboard className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">สรุปภาพรวม</span>
                <span className="sm:hidden">สรุป</span>
              </Button>
              <Button 
                onClick={() => navigate('/payment-queue')}
                className="bg-white/10 text-white border border-white/20 hover:bg-white/20 text-sm"
                size="sm"
              >
                <DollarSign className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">รอจ่ายเงิน</span>
                <span className="sm:hidden">รอจ่าย</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    className="bg-white/10 text-white border border-white/20 hover:bg-white/20 text-sm"
                    size="sm"
                  >
                    <Menu className="h-4 w-4 mr-1.5" />
                    เครื่องมือ
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-popover border-border w-56">
                  <DropdownMenuLabel className="text-xs font-bold text-blue-400">⭐ ใช้บ่อย</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate('/staff-payments')}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    ใบเรียกเก็บ/จ่ายเงิน
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/vendor-management')}>
                    <Building2 className="h-4 w-4 mr-2" />
                    จัดการคู่ค้า & บิล
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/event-pnl')}>
                    <DollarSign className="h-4 w-4 mr-2" />
                    P&L อีเวนท์ (Ready-go)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/review-queue')}>
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    ตรวจสอบรายการ (Review)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/bulk-upload')}>
                    <Upload className="h-4 w-4 mr-2" />
                    อัพโหลดหลายไฟล์
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <Wrench className="h-4 w-4 mr-2" />
                    <span className="font-medium">เครื่องมือทั้งหมด & ตั้งค่า</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                onClick={exportToCSV}
                className="bg-white/10 text-white border border-white/20 hover:bg-white/20 text-sm"
                size="sm"
              >
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">ส่งออก CSV</span>
                <span className="sm:hidden">CSV</span>
              </Button>
              <Button 
                onClick={signOut}
                className="bg-white/10 text-white border border-white/20 hover:bg-white/20 text-sm ml-auto"
                size="sm"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">ออกจากระบบ</span>
                <span className="sm:hidden">ออก</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <MonthlyQuickStats />
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">กำลังโหลดสรุปอีเวนท์…</div>}>
          <EventAnalysis recentOnly />
        </Suspense>
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">กำลังโหลดรายการ…</div>}>
          <ExpenseListReal editId={editId} />
        </Suspense>
      </main>
    </div>
  );
};

export default Index;
