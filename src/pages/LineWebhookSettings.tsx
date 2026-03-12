import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, CheckCircle, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

const LineWebhookSettings = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [mapping, setMapping] = useState<{ line_user_id: string; display_name: string | null } | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<Date | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/line-webhook`;

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadMapping();
    }
  }, [user]);

  const loadMapping = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('line_user_mappings')
      .select('line_user_id, display_name')
      .eq('supabase_user_id', user.id)
      .maybeSingle();
    if (data) setMapping(data);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "คัดลอกแล้ว", description: "Webhook URL ถูกคัดลอกไปยัง clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const generateLinkCode = async () => {
    if (!user) return;
    setGeneratingCode(true);
    try {
      // Generate random 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete old unused codes for this user
      await supabase.from('link_codes').delete().eq('user_id', user.id);

      const { error } = await supabase.from('link_codes').insert({
        user_id: user.id,
        code,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      setLinkCode(code);
      setLinkCodeExpiry(expiresAt);
      toast({ title: "สร้างรหัสสำเร็จ", description: "รหัสมีอายุ 10 นาที" });
    } catch (err) {
      toast({ title: "เกิดข้อผิดพลาด", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGeneratingCode(false);
    }
  };

  const removeMapping = async () => {
    if (!user) return;
    await supabase
      .from('line_user_mappings')
      .delete()
      .eq('supabase_user_id', user.id);
    setMapping(null);
    toast({ title: "ยกเลิกการเชื่อมต่อแล้ว" });
  };

  const isCodeExpired = linkCodeExpiry ? new Date() > linkCodeExpiry : true;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  if (!user) return null;

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
              LINE Webhook
            </h1>
            <p className="text-sm text-muted-foreground">รับสลิปจาก LINE อัตโนมัติ</p>
          </div>
        </div>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. ตั้งค่า Webhook URL</CardTitle>
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

        {/* LINE Account Linking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              2. ผูกบัญชี LINE
            </CardTitle>
            <CardDescription>
              ผูก LINE ของคุณกับระบบ เพื่อให้สลิปที่ส่งผ่าน LINE บันทึกเข้าบัญชีของคุณอัตโนมัติ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mapping ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">เชื่อมต่อแล้ว</p>
                    <p className="text-xs text-muted-foreground font-mono">{mapping.line_user_id}</p>
                    {mapping.display_name && (
                      <p className="text-xs text-muted-foreground">{mapping.display_name}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="ml-2">Active</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={removeMapping}>
                  <Unlink className="h-4 w-4 mr-1" />
                  ยกเลิก
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Generate link code */}
                {linkCode && !isCodeExpired ? (
                  <div className="text-center space-y-3 p-4 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                    <p className="text-sm font-medium">รหัสผูกบัญชีของคุณ</p>
                    <div className="text-4xl font-bold font-mono tracking-[0.3em] text-primary">
                      {linkCode}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⏰ รหัสหมดอายุเวลา {linkCodeExpiry?.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <Button variant="outline" size="sm" onClick={generateLinkCode} disabled={generatingCode}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      สร้างรหัสใหม่
                    </Button>
                  </div>
                ) : (
                  <Button onClick={generateLinkCode} disabled={generatingCode} className="w-full">
                    <KeyRound className="h-4 w-4 mr-2" />
                    {generatingCode ? "กำลังสร้างรหัส..." : "สร้างรหัสผูกบัญชี"}
                  </Button>
                )}

                <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-foreground">📌 ขั้นตอนผูกบัญชี:</p>
                  <ol className="list-decimal ml-4 space-y-0.5">
                    <li>แอดเพื่อน LINE OA: <strong>Cruzee Finance</strong></li>
                    <li>กดปุ่ม "สร้างรหัสผูกบัญชี" ด้านบน</li>
                    <li>ส่งข้อความไปที่ LINE Bot ว่า <code className="bg-muted px-1 py-0.5 rounded text-primary font-mono">ผูก:XXXXXX</code> (แทน XXXXXX ด้วยรหัส 6 หลัก)</li>
                    <li>ระบบจะผูกบัญชีให้อัตโนมัติ ✅</li>
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">วิธีใช้งาน</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <span className="text-2xl">📸</span>
                <div>
                  <p className="font-medium text-foreground">ส่งรูปสลิป</p>
                  <p>ถ่ายรูปหรือส่งรูปสลิปการโอนเงินไปที่ LINE Bot</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <p className="font-medium text-foreground">AI วิเคราะห์อัตโนมัติ</p>
                  <p>ระบบจะอ่านจำนวนเงิน วันที่ ผู้รับ และจัดหมวดหมู่ให้</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-medium text-foreground">บันทึกอัตโนมัติ</p>
                  <p>รายการจะปรากฏในระบบทันที พร้อมแจ้งผลกลับทาง LINE</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LineWebhookSettings;
