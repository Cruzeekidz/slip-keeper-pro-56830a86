import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Calendar, Tag, X, Pencil, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { FestivalManagement } from "@/components/festival-management";

interface EventRegistryItem {
  id: string;
  event_name: string;
  aliases: string[];
  event_date: string | null;
  project_tag: string;
  is_active: boolean;
  created_at: string;
  readygo_event_id: string | null;
}

const EventManagement = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRegistryItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [eventName, setEventName] = useState("");
  const [projectTag, setProjectTag] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [readygoEventId, setReadygoEventId] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) fetchEvents();
  }, [user]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('event_registry')
      .select('*')
      .order('event_date', { ascending: false, nullsFirst: false });
    if (error) { console.error(error); return; }
    setEvents((data as EventRegistryItem[]) || []);
  };

  const resetForm = () => {
    setEventName(""); setProjectTag(""); setEventDate(""); setAliases([]); setAliasInput(""); setEditingId(null); setReadygoEventId("");
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (ev: EventRegistryItem) => {
    setEditingId(ev.id);
    setEventName(ev.event_name);
    setProjectTag(ev.project_tag);
    setEventDate(ev.event_date || "");
    setAliases(ev.aliases || []);
    setReadygoEventId(ev.readygo_event_id || "");
    setDialogOpen(true);
  };

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
    }
    setAliasInput("");
  };

  const removeAlias = (a: string) => setAliases(aliases.filter(x => x !== a));

  const handleSave = async () => {
    if (!eventName || !projectTag || !user) return;

    const payload = {
      event_name: eventName,
      project_tag: projectTag,
      event_date: eventDate || null,
      aliases,
      readygo_event_id: readygoEventId.trim() || null,
      user_id: user.id,
    };

    if (editingId) {
      const { error } = await supabase.from('event_registry').update(payload).eq('id', editingId);
      if (error) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); return; }
      toast({ title: "อัพเดทอีเวนท์สำเร็จ" });
    } else {
      const { error } = await supabase.from('event_registry').insert(payload);
      if (error) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); return; }
      toast({ title: "เพิ่มอีเวนท์สำเร็จ" });
    }

    setDialogOpen(false);
    resetForm();
    fetchEvents();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('event_registry').update({ is_active: !current }).eq('id', id);
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("ยืนยันลบอีเวนท์นี้?")) return;
    await supabase.from('event_registry').delete().eq('id', id);
    toast({ title: "ลบอีเวนท์สำเร็จ" });
    fetchEvents();
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
            <h1 className="text-xl md:text-2xl font-bold">จัดการอีเวนท์</h1>
            <p className="text-primary-foreground/80 text-sm">กำหนดชื่ออีเวนท์ ชื่อเรียกอื่น และวันจัดงาน</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="bg-white text-primary hover:bg-white/90">
                <Plus className="h-4 w-4 mr-2" /> เพิ่มอีเวนท์
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "แก้ไขอีเวนท์" : "เพิ่มอีเวนท์ใหม่"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>ชื่ออีเวนท์</Label>
                  <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="เช่น Terminal21 Rama3" />
                </div>
                <div>
                  <Label>Project Tag</Label>
                  <Input value={projectTag} onChange={e => setProjectTag(e.target.value)} placeholder="เช่น EVT-T21" />
                  <p className="text-xs text-muted-foreground mt-1">ใช้เป็น tag หลักในระบบ</p>
                </div>
                <div>
                  <Label>วันจัดงาน (ถ้ามี)</Label>
                  <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                </div>
                <div>
                  <Label>ชื่อเรียกอื่น (Aliases)</Label>
                  <p className="text-xs text-muted-foreground mb-2">ชื่อที่อาจปรากฏบนสลิป/บิล ระบบจะจับคู่อัตโนมัติ</p>
                  <div className="flex gap-2">
                    <Input
                      value={aliasInput}
                      onChange={e => setAliasInput(e.target.value)}
                      placeholder="เช่น T21, terminal21"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                    />
                    <Button type="button" size="sm" onClick={addAlias}>เพิ่ม</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {aliases.map(a => (
                      <Badge key={a} variant="secondary" className="gap-1">
                        {a}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeAlias(a)} />
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={!eventName || !projectTag}>
                  <Check className="h-4 w-4 mr-2" />
                  {editingId ? "บันทึกการแก้ไข" : "สร้างอีเวนท์"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Festival Section */}
        <FestivalManagement userId={user.id} events={events} />

        <Separator />

        <h2 className="text-lg font-bold text-foreground">อีเวนท์ทั้งหมด</h2>
        {events.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>ยังไม่มีอีเวนท์ กดปุ่ม "เพิ่มอีเวนท์" เพื่อเริ่มต้น</p>
          </Card>
        )}
        {events.map(ev => (
          <Card key={ev.id} className={`p-4 ${!ev.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground">{ev.event_name}</h3>
                  <Badge variant="outline" className="font-mono text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    {ev.project_tag}
                  </Badge>
                  {ev.event_date && (
                    <Badge variant="secondary" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(ev.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </Badge>
                  )}
                  {!ev.is_active && <Badge variant="destructive" className="text-xs">ปิดใช้งาน</Badge>}
                </div>
                {ev.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground mr-1">ชื่อเรียกอื่น:</span>
                    {ev.aliases.map(a => (
                      <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={ev.is_active} onCheckedChange={() => toggleActive(ev.id, ev.is_active)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(ev)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteEvent(ev.id)} className="text-destructive">
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

export default EventManagement;
