import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Link2, Unlink, RefreshCw, KeyRound, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LinkLine = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [mapping, setMapping] = useState<{ line_user_id: string; display_name: string | null } | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<Date | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) loadMapping();
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

  const generateLinkCode = async () => {
    if (!user) return;
    setGeneratingCode(true);
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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
    await supabase.from('line_user_mappings').delete().eq('supabase_user_id', user.id);
    setMapping(null);
    toast({ title: "ยกเลิกการเชื่อมต่อแล้ว" });
  };

  const isCodeExpired = linkCodeExpiry ? new Date() > linkCodeExpiry : true;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-green-500" />
              ผูกบัญชี LINE
            </h1>
            <p className="text-sm text-muted-foreground">เชื่อมต่อ LINE เพื่อส่งสลิปอัตโนมัติ</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              สถานะการเชื่อมต่อ
            </CardTitle>
            <CardDescription>
              ผูก LINE ของคุณกับระบบ เพื่อให้สลิปที่ส่งผ่าน LINE บันทึกเข้าบัญชีอัตโนมัติ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mapping ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">เชื่อมต่อแล้ว ✅</p>
                    {mapping.display_name && (
                      <p className="text-xs text-muted-foreground">{mapping.display_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono">{mapping.line_user_id.slice(0, 10)}...</p>
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
                    <li>ส่งข้อความไปที่ LINE Bot ว่า <code className="bg-muted px-1 py-0.5 rounded text-primary font-mono">ผูก:XXXXXX</code></li>
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
            <CardTitle className="text-lg">ใช้งานอย่างไร?</CardTitle>
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
                  <p>รายการจะปรากฏในระบบทันที</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LinkLine;
