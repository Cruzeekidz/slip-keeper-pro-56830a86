import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, UserPlus, Send, Image, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ForwardRecipient {
  id: string;
  line_user_id: string;
  display_name: string;
  is_active: boolean;
  forward_image: boolean;
  forward_summary: boolean;
  created_at: string;
}

const ForwardManagement = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<ForwardRecipient[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lineUserId, setLineUserId] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Also show LINE users who have messaged the bot (for easy selection)
  const [knownUsers, setKnownUsers] = useState<Array<{ line_user_id: string; display_name: string | null }>>([]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchRecipients();
      fetchKnownUsers();
    }
  }, [user]);

  const fetchRecipients = async () => {
    const { data, error } = await supabase
      .from('forward_recipients')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setRecipients((data as ForwardRecipient[]) || []);
  };

  const fetchKnownUsers = async () => {
    // Get LINE users who have interacted with the bot
    const { data } = await supabase
      .from('line_user_mappings')
      .select('line_user_id, display_name');
    setKnownUsers(data || []);
  };

  const handleAdd = async () => {
    if (!lineUserId || !displayName || !user) return;

    const { error } = await supabase.from('forward_recipients').insert({
      user_id: user.id,
      line_user_id: lineUserId.trim(),
      display_name: displayName.trim(),
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: "มีผู้รับนี้อยู่แล้ว", variant: "destructive" });
      } else {
        toast({ title: "เกิดข้อผิดพลาด", description: error.message, variant: "destructive" });
      }
      return;
    }

    toast({ title: "เพิ่มผู้รับ forward สำเร็จ" });
    setDialogOpen(false);
    setLineUserId("");
    setDisplayName("");
    fetchRecipients();
  };

  const toggleField = async (id: string, field: 'is_active' | 'forward_image' | 'forward_summary', current: boolean) => {
    await supabase.from('forward_recipients').update({ [field]: !current }).eq('id', id);
    fetchRecipients();
  };

  const deleteRecipient = async (id: string) => {
    if (!confirm("ยืนยันลบผู้รับนี้?")) return;
    await supabase.from('forward_recipients').delete().eq('id', id);
    toast({ title: "ลบผู้รับสำเร็จ" });
    fetchRecipients();
  };

  const selectKnownUser = (u: { line_user_id: string; display_name: string | null }) => {
    setLineUserId(u.line_user_id);
    setDisplayName(u.display_name || "");
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">Forward สลิป</h1>
            <p className="text-primary-foreground/80 text-sm">ส่งต่อสลิปอัตโนมัติให้คนที่กำหนด</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-white text-primary hover:bg-white/90">
                <Plus className="h-4 w-4 mr-2" /> เพิ่มผู้รับ
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>เพิ่มผู้รับ Forward</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {knownUsers.length > 0 && (
                  <div>
                    <Label className="text-sm">เลือกจากผู้ใช้ที่เคยทักมา</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {knownUsers.map(u => (
                        <Button
                          key={u.line_user_id}
                          variant={lineUserId === u.line_user_id ? "default" : "outline"}
                          size="sm"
                          onClick={() => selectKnownUser(u)}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          {u.display_name || u.line_user_id.slice(0, 8)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label>ชื่อแสดง</Label>
                  <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="เช่น Pani (บัญชี)" />
                </div>
                <div>
                  <Label>LINE User ID</Label>
                  <Input value={lineUserId} onChange={e => setLineUserId(e.target.value)} placeholder="U..." className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground mt-1">
                    ผู้รับต้องแอด LINE OA และทักมาอย่างน้อย 1 ครั้ง
                  </p>
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={!lineUserId || !displayName}>
                  เพิ่มผู้รับ
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <Card className="p-4 bg-muted/50 border-dashed">
          <h3 className="font-medium text-foreground mb-2">📋 วิธีใช้งาน</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>ให้ผู้รับ (เช่น คุณ Pani) แอด LINE OA ของคุณ</li>
            <li>ทักข้อความอะไรก็ได้มา 1 ครั้ง (เช่น "สวัสดี")</li>
            <li>กลับมาที่หน้านี้ กด "เพิ่มผู้รับ" แล้วเลือกจากรายชื่อ</li>
            <li>เมื่อคุณส่งสลิป ระบบจะ forward ให้อัตโนมัติ!</li>
          </ol>
        </Card>

        {recipients.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>ยังไม่มีผู้รับ forward กด "เพิ่มผู้รับ" เพื่อเริ่มต้น</p>
          </Card>
        )}

        {recipients.map(r => (
          <Card key={r.id} className={`p-4 ${!r.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{r.display_name}</h3>
                <p className="text-xs text-muted-foreground font-mono">{r.line_user_id}</p>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={r.forward_image}
                      onCheckedChange={() => toggleField(r.id, 'forward_image', r.forward_image)}
                    />
                    <Image className="h-3.5 w-3.5" />
                    ส่งรูป
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={r.forward_summary}
                      onCheckedChange={() => toggleField(r.id, 'forward_summary', r.forward_summary)}
                    />
                    <FileText className="h-3.5 w-3.5" />
                    ส่งสรุป
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={r.is_active} onCheckedChange={() => toggleField(r.id, 'is_active', r.is_active)} />
                <Button variant="ghost" size="icon" onClick={() => deleteRecipient(r.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
};

export default ForwardManagement;
