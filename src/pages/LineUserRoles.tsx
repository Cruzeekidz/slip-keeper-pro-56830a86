import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, UserCheck, Users, Crown, Link2, Unlink, Check, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LineUserRole {
  id: string;
  line_user_id: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

interface LinkOption {
  id: string;
  kind: 'staff' | 'vendor';
  label: string;
  sublabel?: string;
  line_user_id: string | null;
}

const ROLE_CONFIG: Record<string, { label: string; description: string; icon: typeof Shield }> = {
  admin: { label: "Admin", description: "ส่งสลิป → วิเคราะห์+บันทึก", icon: Crown },
  accountant: { label: "นักบัญชี", description: "รับ forward สลิป", icon: UserCheck },
  member: { label: "คู่ค้า", description: "ส่งบิล/รับสลิปยืนยัน (อนาคต)", icon: Users },
};

const LineUserRoles = () => {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roles, setRoles] = useState<LineUserRole[]>([]);
  const [fetching, setFetching] = useState(true);
  const [options, setOptions] = useState<LinkOption[]>([]);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
    if (user && isSuperAdmin) {
      fetchRoles();
      fetchOptions();
    }
  }, [user, isSuperAdmin]);

  const fetchRoles = async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from('line_user_roles')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setRoles((data as LineUserRole[]) || []);
    setFetching(false);
  };

  const fetchOptions = async () => {
    if (!user) return;
    const [{ data: staff }, { data: vendors }] = await Promise.all([
      supabase.from('staff_profiles').select('id, staff_name, nickname, line_user_id').eq('user_id', user.id).eq('is_active', true),
      supabase.from('vendor_profiles').select('id, company_name, line_user_id').eq('user_id', user.id).eq('is_active', true),
    ]);
    const opts: LinkOption[] = [
      ...((staff || []).map((s: any) => ({
        id: s.id, kind: 'staff' as const,
        label: s.staff_name + (s.nickname ? ` (${s.nickname})` : ''),
        sublabel: 'ทีมงาน', line_user_id: s.line_user_id,
      }))),
      ...((vendors || []).map((v: any) => ({
        id: v.id, kind: 'vendor' as const,
        label: v.company_name, sublabel: 'คู่ค้า', line_user_id: v.line_user_id,
      }))),
    ];
    setOptions(opts);
  };

  const linkedFor = (lineUserId: string): LinkOption | undefined =>
    options.find(o => o.line_user_id === lineUserId);

  const handleLink = async (lineUserId: string, opt: LinkOption) => {
    const table = opt.kind === 'staff' ? 'staff_profiles' : 'vendor_profiles';
    const { error } = await supabase.from(table).update({ line_user_id: lineUserId }).eq('id', opt.id);
    if (error) {
      toast({ title: "ผูกไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ผูกสำเร็จ", description: `${opt.label} ↔ LINE` });
    setOpenPopoverId(null);
    fetchOptions();
  };

  const handleUnlink = async (opt: LinkOption) => {
    const table = opt.kind === 'staff' ? 'staff_profiles' : 'vendor_profiles';
    const { error } = await supabase.from(table).update({ line_user_id: null }).eq('id', opt.id);
    if (error) {
      toast({ title: "ยกเลิกไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ยกเลิกการผูกแล้ว" });
    fetchOptions();
  };

  const updateRole = async (id: string, newRole: string) => {
    const { error } = await supabase
      .from('line_user_roles')
      .update({ role: newRole })
      .eq('id', id);

    if (error) {
      toast({ title: "เกิดข้อผิดพลาด", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "อัปเดตสำเร็จ", description: `เปลี่ยน role เป็น ${newRole} แล้ว` });
    fetchRoles();
  };

  if (loading || !user) return null;

  const adminCount = roles.filter(r => r.role === 'admin').length;
  const accountantCount = roles.filter(r => r.role === 'accountant').length;
  const memberCount = roles.filter(r => r.role === 'member').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              LINE User Roles
            </h1>
            <p className="text-primary-foreground/80 text-sm">จัดการสิทธิ์ผู้ใช้ LINE Bot</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <Crown className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold text-foreground">{adminCount}</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </Card>
          <Card className="p-4 text-center">
            <UserCheck className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{accountantCount}</p>
            <p className="text-xs text-muted-foreground">นักบัญชี</p>
          </Card>
          <Card className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold text-foreground">{memberCount}</p>
            <p className="text-xs text-muted-foreground">คู่ค้า</p>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="p-4 bg-muted/50 border-dashed">
          <h3 className="font-medium text-foreground mb-2">📋 Role ในระบบ</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Admin</strong> = ส่งสลิป → ระบบวิเคราะห์และบันทึกค่าใช้จ่ายให้</li>
            <li><strong>นักบัญชี</strong> = รับ forward สลิปอัตโนมัติ</li>
            <li><strong>คู่ค้า</strong> = ส่งบิลเรียกเก็บ / รับสลิปยืนยันการจ่าย (อนาคต)</li>
            <li>ให้คนที่ต้องการเพิ่ม ทักข้อความมาที่ LINE Bot 1 ครั้ง</li>
          </ul>
        </Card>

        {/* User list */}
        {fetching ? (
          <Card className="p-8 text-center text-muted-foreground">กำลังโหลด...</Card>
        ) : roles.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>ยังไม่มีผู้ใช้ LINE ในระบบ</p>
            <p className="text-xs mt-1">ให้ทักข้อความมาที่ LINE Bot เพื่อลงทะเบียน</p>
          </Card>
        ) : (
          roles.map(r => {
            const config = ROLE_CONFIG[r.role] || ROLE_CONFIG.member;
            const Icon = config.icon;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-full ${r.role === 'admin' ? 'bg-amber-100' : 'bg-muted'}`}>
                      <Icon className={`h-4 w-4 ${r.role === 'admin' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {r.display_name || 'ไม่ทราบชื่อ'}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{r.line_user_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={r.role} onValueChange={(val) => updateRole(r.id, val)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-1"><Crown className="h-3 w-3" /> Admin</span>
                        </SelectItem>
                        <SelectItem value="accountant">
                          <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> นักบัญชี</span>
                        </SelectItem>
                        <SelectItem value="member">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> คู่ค้า</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Link to staff/vendor registry */}
                <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground shrink-0">🔗 ผูกกับทะเบียน:</span>
                  {(() => {
                    const linked = linkedFor(r.line_user_id);
                    if (linked) {
                      return (
                        <>
                          <Badge variant="secondary" className="gap-1">
                            {linked.kind === 'staff' ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                            {linked.label}
                          </Badge>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleUnlink(linked)}>
                            <Unlink className="h-3 w-3 mr-1" /> ยกเลิก
                          </Button>
                        </>
                      );
                    }
                    const popoverOpen = openPopoverId === r.id;
                    const available = options.filter(o => !o.line_user_id);
                    const filtered = search.trim()
                      ? available.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
                      : available;
                    return (
                      <Popover open={popoverOpen} onOpenChange={(o) => { setOpenPopoverId(o ? r.id : null); if (!o) setSearch(""); }}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Link2 className="h-3 w-3 mr-1" /> เลือกทีมงาน/คู่ค้า
                            <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-2" align="start">
                          <Input
                            autoFocus
                            placeholder="ค้นหาชื่อ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 mb-2"
                          />
                          <ScrollArea className="max-h-[260px]">
                            {filtered.length === 0 ? (
                              <p className="text-xs text-muted-foreground p-3 text-center">
                                {available.length === 0 ? 'ไม่มีทีมงาน/คู่ค้าที่ยังไม่ผูก' : 'ไม่พบ'}
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {filtered.map(opt => (
                                  <button
                                    key={`${opt.kind}-${opt.id}`}
                                    type="button"
                                    onClick={() => handleLink(r.line_user_id, opt)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                                  >
                                    {opt.kind === 'staff'
                                      ? <UserCheck className="h-3 w-3 text-primary shrink-0" />
                                      : <Users className="h-3 w-3 text-muted-foreground shrink-0" />}
                                    <span className="flex-1 truncate">{opt.label}</span>
                                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{opt.sublabel}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
};

export default LineUserRoles;
