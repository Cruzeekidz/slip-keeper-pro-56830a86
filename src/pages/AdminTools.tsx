import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, BarChart3, FileText, Wallet, Banknote, FolderOpen, AlertTriangle, History,
  Send, Database, Settings, Users, Link2, ServerCog, Shield, BookOpen, MessageSquare, CalendarClock, RefreshCw, Plug,
} from "lucide-react";

interface ToolItem {
  label: string;
  icon: any;
  onClick: () => void;
}
interface ToolGroup {
  title: string;
  color: string;
  items: ToolItem[];
}

const AdminTools = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { toast } = useToast();

  const copyPortal = (suffix: string, label: string) => {
    const url = `${window.location.origin}/portal${suffix ? `?view=${suffix}&owner=${user?.id}` : `?owner=${user?.id}`}`;
    navigator.clipboard.writeText(url);
    toast({ title: "คัดลอกลิงก์สำเร็จ", description: label });
  };

  const groups: ToolGroup[] = [
    {
      title: "📊 รายงาน & คลังข้อมูล",
      color: "text-blue-400",
      items: [
        { label: "รายงานธุรกรรม", icon: BarChart3, onClick: () => navigate("/transaction-report") },
        { label: "รายงานภาษีหัก ณ ที่จ่าย", icon: FileText, onClick: () => navigate("/wht-report") },
        { label: "ใบเบิกเงินทดรองจ่าย", icon: Wallet, onClick: () => navigate("/cash-advance") },
        { label: "บันทึกค่าใช้จ่ายเงินสด", icon: Banknote, onClick: () => navigate("/cash-expense") },
        { label: "คลังสลิป", icon: FolderOpen, onClick: () => navigate("/receipt-archive") },
        { label: "คลังเอกสารแนบ (บิล/ใบเบิก/สลิปจ่าย)", icon: FolderOpen, onClick: () => navigate("/attachments-archive") },
      ],
    },
    {
      title: "🔍 ตรวจสอบ & แก้ไขข้อมูล",
      color: "text-emerald-400",
      items: [
        { label: "ประวัติการลบ", icon: History, onClick: () => navigate("/deleted-history") },
        { label: "ตรวจสอบรายการซ้ำ", icon: AlertTriangle, onClick: () => navigate("/duplicate-checker") },
        { label: "แก้วันที่อัตโนมัติ (DD/YY สลับ)", icon: CalendarClock, onClick: () => navigate("/fix-swapped-dates") },
        { label: "วิเคราะห์สลิปล่าสุดใหม่ (OCR)", icon: RefreshCw, onClick: () => navigate("/reanalyze-recent") },
      ],
    },
    {
      title: "⚙️ ตั้งค่าระบบ",
      color: "text-violet-400",
      items: [
        { label: "จัดการข้อมูลหลัก", icon: Settings, onClick: () => navigate("/master-data") },
        { label: "จัดการกลุ่มผู้รับเงิน", icon: Settings, onClick: () => navigate("/payee-groups") },
        { label: "จัดการอีเวนท์", icon: Settings, onClick: () => navigate("/event-management") },
        { label: "บัญชีธนาคาร", icon: Database, onClick: () => navigate("/bank-accounts") },
        { label: "Forward สลิป", icon: Send, onClick: () => navigate("/forward-management") },
        { label: "แปลงข้อมูล (Migration)", icon: Database, onClick: () => navigate("/data-migration") },
      ],
    },
    {
      title: "👷 ทะเบียน & ลิงก์พอร์ทัล",
      color: "text-cyan-400",
      items: [
        { label: "จัดการทะเบียนทีมงาน", icon: Users, onClick: () => navigate("/staff-management") },
        { label: "ผูกบัญชี LINE", icon: Link2, onClick: () => navigate("/link-line") },
        { label: "คัดลอกลิงก์ลงทะเบียนทีมงาน", icon: Link2, onClick: () => copyPortal("staff-register", "ลิงก์ลงทะเบียนทีมงาน") },
        { label: "คัดลอกลิงก์ลงทะเบียนคู่ค้า", icon: Link2, onClick: () => copyPortal("vendor-register", "ลิงก์ลงทะเบียนคู่ค้า") },
        { label: "คัดลอกลิงก์พอร์ทัลหลัก", icon: Link2, onClick: () => copyPortal("", "ลิงก์พอร์ทัลหลัก") },
      ],
    },
  ];

  if (isSuperAdmin) {
    groups.push({
      title: "🔧 ผู้ดูแลระบบ (Super Admin)",
      color: "text-rose-400",
      items: [
        { label: "จัดการผู้ดูแลระบบ", icon: ServerCog, onClick: () => navigate("/system-admin") },
        { label: "LINE User Roles", icon: Shield, onClick: () => navigate("/line-user-roles") },
        { label: "เอกสารระบบ", icon: BookOpen, onClick: () => navigate("/system-docs") },
        { label: "LINE Webhook", icon: MessageSquare, onClick: () => navigate("/line-webhook") },
        {
          label: "จัดหมวดหมู่ใหม่ (Migrate)",
          icon: Database,
          onClick: async () => {
            toast({ title: "กำลังจัดหมวดหมู่ใหม่..." });
            const { data, error } = await supabase.functions.invoke("migrate-categories");
            if (error) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); return; }
            toast({ title: "จัดหมวดหมู่สำเร็จ", description: `อัพเดท ${data?.migrated || 0} จาก ${data?.total || 0} รายการ` });
          },
        },
        {
          label: "ทดสอบ FlowAccount Sandbox Token",
          icon: Plug,
          onClick: async () => {
            toast({ title: "กำลังขอ access token..." });
            const { data, error } = await supabase.functions.invoke("flowaccount-test");
            if (error) { toast({ title: "เรียก function ไม่สำเร็จ", description: error.message, variant: "destructive" }); return; }
            if (!data?.success) {
              toast({
                title: `❌ Token ล้มเหลว (HTTP ${data?.status ?? '?'})`,
                description: typeof data?.response === 'string' ? data.response : JSON.stringify(data?.response ?? data?.error ?? data).slice(0, 200),
                variant: "destructive",
              });
              console.error('[flowaccount-test]', data);
              return;
            }
            toast({
              title: `✅ Token OK (${data.latencyMs}ms)`,
              description: `type=${data.token?.type} expires_in=${data.token?.expires_in}s scope=${data.token?.scope ?? '-'}`,
            });
            console.log('[flowaccount-test] success', data);
          },
        },
      ],
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Settings className="h-6 w-6" />
          <h1 className="text-xl font-bold">เครื่องมือทั้งหมด</h1>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-6 grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-base ${g.color}`}>{g.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {g.items.map((it) => (
                <Button
                  key={it.label}
                  variant="outline"
                  className="justify-start h-auto py-2.5"
                  onClick={it.onClick}
                >
                  <it.icon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="text-left">{it.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
};

export default AdminTools;