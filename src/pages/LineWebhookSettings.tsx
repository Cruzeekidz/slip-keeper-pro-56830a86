import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, CheckCircle, MessageSquare, Link2, Unlink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LineWebhookSettings = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [lineUserId, setLineUserId] = useState("");
  const [mapping, setMapping] = useState<{ line_user_id: string; display_name: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const saveMapping = async () => {
    if (!user || !lineUserId.trim()) return;
    setSaving(true);
    try {
      if (mapping) {
        // Delete old mapping first
        await supabase
          .from('line_user_mappings')
          .delete()
          .eq('supabase_user_id', user.id);
      }
      const { error } = await supabase
        .from('line_user_mappings')
        .insert({
          line_user_id: lineUserId.trim(),
          supabase_user_id: user.id,
          display_name: null,
        });
      if (error) throw error;
      toast({ title: "บันทึกสำเร็จ", description: "เชื่อมต่อ LINE User ID แล้ว" });
      setMapping({ line_user_id: lineUserId.trim(), display_name: null });
      setLineUserId("");
    } catch (err) {
      toast({ title: "เกิดข้อผิดพลาด", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
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

        {/* LINE User Mapping */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. เชื่อมต่อ LINE User ID</CardTitle>
            <CardDescription>
              เชื่อม LINE User ID ของคุณเพื่อให้สลิปที่ส่งผ่าน LINE บันทึกเข้าบัญชีของคุณอัตโนมัติ
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
                  </div>
                  <Badge variant="secondary" className="ml-2">Active</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={removeMapping}>
                  <Unlink className="h-4 w-4 mr-1" />
                  ยกเลิก
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>LINE User ID</Label>
                  <Input
                    placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={lineUserId}
                    onChange={(e) => setLineUserId(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <Button onClick={saveMapping} disabled={!lineUserId.trim() || saving}>
                  <Link2 className="h-4 w-4 mr-2" />
                  เชื่อมต่อ
                </Button>
                <p className="text-xs text-muted-foreground">
                  💡 วิธีหา LINE User ID: ส่งข้อความอะไรก็ได้ไปที่ Bot แล้วดู Log ใน Edge Function Logs หรือใช้ <a href="https://developers.line.biz/console/" target="_blank" rel="noopener" className="text-primary underline">LINE Developers Console</a>
                </p>
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
