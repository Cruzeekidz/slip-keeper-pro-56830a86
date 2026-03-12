import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, Crown, UserPlus, Trash2, ServerCog } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserRoleEntry {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

const ROLE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  super_admin: { label: "ผู้ดูแลระบบ", description: "จัดการระบบทั้งหมด, Webhook, ดูข้อมูลทุกบัญชี", color: "text-red-600 bg-red-100" },
  admin: { label: "แอดมินบัญชี", description: "จัดการข้อมูลของบัญชีตัวเอง", color: "text-amber-600 bg-amber-100" },
  user: { label: "ผู้ใช้ทั่วไป", description: "ใช้งานปกติ", color: "text-muted-foreground bg-muted" },
};

const SystemAdmin = () => {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roles, setRoles] = useState<UserRoleEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("admin");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      toast({ title: "ไม่มีสิทธิ์เข้าถึง", description: "หน้านี้สำหรับผู้ดูแลระบบเท่านั้น", variant: "destructive" });
      navigate('/');
    }
  }, [isSuperAdmin, roleLoading, navigate, toast]);

  useEffect(() => {
    if (user && isSuperAdmin) fetchRoles();
  }, [user, isSuperAdmin]);

  const fetchRoles = async () => {
    setFetching(true);
    // super_admin can see all roles via service_role policy
    // but we query with authenticated user - need RLS to allow super_admin to see all
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setRoles((data as UserRoleEntry[]) || []);
    setFetching(false);
  };

  const addRole = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);

    try {
      // Look up user by email using edge function
      const { data, error } = await supabase.functions.invoke('manage-roles', {
        body: { action: 'add', email: newEmail.trim(), role: newRole }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "เพิ่มสำเร็จ", description: `เพิ่ม ${ROLE_LABELS[newRole]?.label || newRole} ให้ ${newEmail} แล้ว` });
      setNewEmail("");
      fetchRoles();
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setAdding(false);
  };

  const removeRole = async (id: string) => {
    const { error } = await supabase.functions.invoke('manage-roles', {
      body: { action: 'remove', roleId: id }
    });

    if (error) {
      toast({ title: "เกิดข้อผิดพลาด", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ลบสำเร็จ" });
    fetchRoles();
  };

  if (loading || roleLoading || !user || !isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <ServerCog className="h-6 w-6" />
              จัดการผู้ดูแลระบบ
            </h1>
            <p className="text-primary-foreground/80 text-sm">System Administration</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-4">
        {/* Role Legend */}
        <Card className="p-4 bg-muted/50 border-dashed">
          <h3 className="font-medium text-foreground mb-2">📋 ระดับสิทธิ์ในระบบ</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>ผู้ดูแลระบบ (super_admin)</strong> = ตั้งค่า Webhook, จัดการ LINE User Roles, ดูข้อมูลทุกบัญชี</li>
            <li><strong>แอดมินบัญชี (admin)</strong> = จัดการข้อมูลภายในบัญชีตัวเอง (อนาคต: มอบหมายให้คนอื่นช่วย)</li>
            <li><strong>ผู้ใช้ทั่วไป (user)</strong> = ใช้งานปกติ บันทึกค่าใช้จ่ายของตัวเอง</li>
          </ul>
        </Card>

        {/* Add Role */}
        <Card className="p-4">
          <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            เพิ่มสิทธิ์ผู้ใช้
          </h3>
          <div className="flex gap-2">
            <Input
              placeholder="อีเมลผู้ใช้"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">ผู้ดูแลระบบ</SelectItem>
                <SelectItem value="admin">แอดมินบัญชี</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addRole} disabled={adding || !newEmail.trim()}>
              {adding ? "กำลังเพิ่ม..." : "เพิ่ม"}
            </Button>
          </div>
        </Card>

        {/* User list */}
        {fetching ? (
          <Card className="p-8 text-center text-muted-foreground">กำลังโหลด...</Card>
        ) : roles.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>ยังไม่มีสิทธิ์พิเศษในระบบ</p>
          </Card>
        ) : (
          roles.map(r => {
            const config = ROLE_LABELS[r.role] || ROLE_LABELS.user;
            const isCurrentUser = r.user_id === user.id;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-full ${config.color.split(' ')[1]}`}>
                      {r.role === 'super_admin' ? (
                        <Crown className={`h-4 w-4 ${config.color.split(' ')[0]}`} />
                      ) : (
                        <Shield className={`h-4 w-4 ${config.color.split(' ')[0]}`} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {r.user_id}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                  {!isCurrentUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRole(r.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
};

export default SystemAdmin;
