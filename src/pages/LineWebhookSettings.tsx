import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, CheckCircle, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

const LineWebhookSettings = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/line-webhook`;

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      toast({ title: "ไม่มีสิทธิ์เข้าถึง", description: "หน้านี้สำหรับผู้ดูแลระบบเท่านั้น", variant: "destructive" });
      navigate('/');
    }
  }, [isSuperAdmin, roleLoading, navigate, toast]);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "คัดลอกแล้ว", description: "Webhook URL ถูกคัดลอกไปยัง clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || roleLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-green-500" />
              LINE Webhook (Admin)
            </h1>
            <p className="text-sm text-muted-foreground">ตั้งค่าเชื่อมต่อ LINE Official Account</p>
          </div>
        </div>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Webhook URL</CardTitle>
            <CardDescription>คัดลอก URL นี้ไปวางใน LINE Developers Console → Messaging API → Webhook URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>📌 ขั้นตอน:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>ไปที่ <a href="https://developers.line.biz/" target="_blank" rel="noopener" className="text-primary underline">LINE Developers Console</a></li>
                <li>เลือก Channel → Messaging API</li>
                <li>วาง Webhook URL ด้านบน</li>
                <li>เปิด "Use webhook" ให้เป็น ON</li>
                <li>ปิด "Auto-reply messages" (ไม่จำเป็น)</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ระบบผูกบัญชี</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>ผู้ใช้ทั่วไปสามารถผูกบัญชี LINE ได้จากหน้า <strong>"ผูกบัญชี LINE"</strong> ในเมนูเครื่องมือ</p>
              <p>ระบบใช้รหัส 6 หลัก โดยผู้ใช้จะสร้างรหัสจากเว็บ แล้วส่ง <code className="bg-muted px-1 py-0.5 rounded font-mono">ผูก:XXXXXX</code> ไปที่ LINE Bot</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LineWebhookSettings;
