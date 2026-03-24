import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Calendar, Tag, X, Pencil, Check, Loader2, RefreshCw, Link2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface ReadyGoEvent {
  id: string;
  title: string;
  short_code: string;
  event_date: string | null;
  location: string | null;
}

const EventManagement = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRegistryItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Ready-go events
  const [readyGoEvents, setReadyGoEvents] = useState<ReadyGoEvent[]>([]);
  const [loadingReadyGo, setLoadingReadyGo] = useState(false);

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
    if (user) {
      fetchEvents();
      fetchReadyGoEvents();
    }
  }, [user]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('event_registry')
      .select('*')
      .order('event_date', { ascending: false, nullsFirst: false });
    if (error) { console.error(error); return; }
    setEvents((data as EventRegistryItem[]) || []);
  };

  const fetchReadyGoEvents = async () => {
    setLoadingReadyGo(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "list-events" },
      });
      if (error) throw error;
      setReadyGoEvents(data?.events || []);
    } catch (err) {
      console.error("Failed to fetch Ready-go events:", err);
    } finally {
      setLoadingReadyGo(false);
    }
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

  const createFromReadyGo = (rg: ReadyGoEvent) => {
    resetForm();
    setEventName(rg.title);
    // Generate a project tag from the title
    const shortName = rg.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join('-').substring(0, 20);
    const dateStr = rg.event_date ? rg.event_date.replace(/-/g, '').substring(0, 8) : '';
    setProjectTag(`EVT-${shortName}${dateStr ? '-' + dateStr : ''}`);
    setEventDate(rg.event_date || "");
    setReadygoEventId(rg.id);
    // Add short_code and location as aliases
    const autoAliases: string[] = [];
    if (rg.short_code) autoAliases.push(rg.short_code);
    if (rg.location) autoAliases.push(rg.location);
    setAliases(autoAliases);
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

  // Find which Ready-go events are already linked
  const linkedReadyGoIds = new Set(events.map(e => e.readygo_event_id).filter(Boolean));

  // Unlinked Ready-go events
  const unlinkedReadyGoEvents = readyGoEvents.filter(rg => !linkedReadyGoIds.has(rg.id));

  // Get Ready-go event name by ID for display
  const getReadyGoName = (id: string) => readyGoEvents.find(rg => rg.id === id)?.title || id.substring(0, 8) + '...';

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
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                  <Label>เชื่อมต่อ Ready-go Event</Label>
                  <Select value={readygoEventId} onValueChange={setReadygoEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกอีเวนท์จาก Ready-go (ถ้ามี)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่เชื่อมต่อ —</SelectItem>
                      {readyGoEvents.map(rg => (
                        <SelectItem key={rg.id} value={rg.id} disabled={linkedReadyGoIds.has(rg.id) && readygoEventId !== rg.id}>
                          <div className="flex flex-col">
                            <span>{rg.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {rg.event_date ? new Date(rg.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                              {rg.location ? ` • ${rg.location}` : ''}
                              {linkedReadyGoIds.has(rg.id) && readygoEventId !== rg.id ? ' (ผูกแล้ว)' : ''}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">เลือกเพื่อดึงรายได้จาก Ready-go.fun อัตโนมัติ</p>
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
                <Button onClick={() => {
                  if (readygoEventId === "none") setReadygoEventId("");
                  handleSave();
                }} className="w-full" disabled={!eventName || !projectTag}>
                  <Check className="h-4 w-4 mr-2" />
                  {editingId ? "บันทึกการแก้ไข" : "สร้างอีเวนท์"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Ready-go Events - Quick Import */}
        {unlinkedReadyGoEvents.length > 0 && (
          <Card className="p-4 border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">อีเวนท์จาก Ready-go ที่ยังไม่ได้ผูก</h3>
                <Badge variant="secondary" className="text-xs">{unlinkedReadyGoEvents.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchReadyGoEvents} disabled={loadingReadyGo}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadingReadyGo ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unlinkedReadyGoEvents.slice(0, 6).map(rg => (
                <button
                  key={rg.id}
                  onClick={() => createFromReadyGo(rg)}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-background hover:bg-accent text-left transition-colors"
                >
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{rg.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {rg.event_date ? new Date(rg.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'ไม่ระบุวันที่'}
                      {rg.location ? ` • ${rg.location}` : ''}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
            {unlinkedReadyGoEvents.length > 6 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                และอีก {unlinkedReadyGoEvents.length - 6} อีเวนท์...
              </p>
            )}
          </Card>
        )}

        {loadingReadyGo && readyGoEvents.length === 0 && (
          <Card className="p-4 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">กำลังโหลดอีเวนท์จาก Ready-go...</span>
          </Card>
        )}

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
                  {ev.readygo_event_id && (
                    <Badge className="text-xs bg-primary/10 text-primary border-0">
                      Ready-go
                    </Badge>
                  )}
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
