import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state changes - PASSWORD_RECOVERY event fires when user clicks reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
        setChecking(false);
      } else if (event === "SIGNED_IN" && session) {
        // When redirected from reset link, sometimes it fires SIGNED_IN instead
        // Check if the URL has recovery-related params
        const hash = window.location.hash;
        const search = window.location.search;
        if (hash.includes("type=recovery") || search.includes("type=recovery")) {
          setIsRecovery(true);
          setChecking(false);
        } else {
          // User is already signed in via recovery link - show the form
          setIsRecovery(true);
          setChecking(false);
        }
      }
    });

    // Also check current session - if user landed here via recovery redirect, they'll have a session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // User has a valid session (from clicking the recovery link)
        setIsRecovery(true);
      }
      setChecking(false);
    };

    // Give a moment for the auth state change to fire, then check session
    const timer = setTimeout(checkSession, 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "รหัสผ่านไม่ตรงกัน",
        description: "กรุณากรอกรหัสผ่านให้ตรงกันทั้งสองช่อง",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "รหัสผ่านสั้นเกินไป",
        description: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({
        title: "เปลี่ยนรหัสผ่านสำเร็จ",
        description: "กำลังนำคุณไปยังหน้าหลัก...",
      });
      setTimeout(() => navigate("/"), 1500);
    } catch (error: any) {
      toast({
        title: "เกิดข้อผิดพลาด",
        description: error.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 bg-gradient-card shadow-elevated text-center">
          <h1 className="text-xl font-bold text-foreground mb-4">กำลังตรวจสอบลิงก์...</h1>
          <p className="text-muted-foreground">กรุณารอสักครู่</p>
        </Card>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 bg-gradient-card shadow-elevated text-center">
          <h1 className="text-xl font-bold text-foreground mb-4">ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
          <p className="text-muted-foreground mb-4">กรุณาขอลิงก์รีเซ็ตรหัสผ่านใหม่อีกครั้ง</p>
          <Button variant="outline" onClick={() => navigate("/auth")}>
            กลับไปหน้าเข้าสู่ระบบ
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 bg-gradient-card shadow-elevated">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-muted-foreground mt-2">กรุณากรอกรหัสผ่านใหม่ของคุณ</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">รหัสผ่านใหม่</Label>
            <Input
              id="password"
              type="password"
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">ยืนยันรหัสผ่านใหม่</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full bg-gradient-primary" disabled={loading}>
            {loading ? "กำลังดำเนินการ..." : "เปลี่ยนรหัสผ่าน"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
