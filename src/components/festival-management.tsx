import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Layers, Plus, Pencil, Trash2, Calendar, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventRegistryItem {
  id: string;
  event_name: string;
  aliases: string[];
  event_date: string | null;
  project_tag: string;
  is_active: boolean;
}

interface EventGroup {
  id: string;
  group_name: string;
  project_tag: string;
  readygo_event_ids: string[];
  festival_date: string | null;
}

interface ReadyGoEvent {
  id: string;
  title: string;
  short_code: string;
  event_date: string;
}

interface FestivalManagementProps {
  userId: string;
  events: EventRegistryItem[];
}

export function FestivalManagement({ userId, events }: FestivalManagementProps) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [readyGoEvents, setReadyGoEvents] = useState<ReadyGoEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<EventGroup | null>(null);

  // Form state
  const [groupName, setGroupName] = useState("");
  const [projectTag, setProjectTag] = useState("");
  const [festivalDate, setFestivalDate] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  useEffect(() => {
    fetchGroups();
    fetchReadyGoEvents();
  }, []);

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("event_groups")
      .select("*")
      .eq("user_id", userId)
      .order("festival_date", { ascending: false, nullsFirst: false });
    setGroups((data as any[]) || []);
  };

  const fetchReadyGoEvents = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "list-events" },
      });
      if (error) throw error;
      setReadyGoEvents(data.events || []);
    } catch {
      // Silent fail - Ready-go may not be configured
    }
  };

  const resetForm = () => {
    setGroupName("");
    setProjectTag("");
    setFestivalDate("");
    setSelectedEventIds([]);
    setEditingGroup(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (g: EventGroup) => {
    setEditingGroup(g);
    setGroupName(g.group_name);
    setProjectTag(g.project_tag);
    setFestivalDate(g.festival_date || "");
    setSelectedEventIds(g.readygo_event_ids || []);
    setDialogOpen(true);
  };

  const toggleEventId = (id: string) => {
    setSelectedEventIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!groupName || !projectTag) return;

    const payload = {
      group_name: groupName,
      project_tag: projectTag,
      festival_date: festivalDate || null,
      readygo_event_ids: selectedEventIds,
      user_id: userId,
    };

    if (editingGroup) {
      const { error } = await supabase
        .from("event_groups")
        .update(payload)
        .eq("id", editingGroup.id);
      if (error) {
        toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
        return;
      }
      toast({ title: "อัพเดท Festival สำเร็จ" });
    } else {
      const { error } = await supabase.from("event_groups").insert(payload);
      if (error) {
        toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
        return;
      }
      toast({ title: "สร้าง Festival สำเร็จ" });
    }

    setDialogOpen(false);
    resetForm();
    fetchGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!confirm("ยืนยันลบ Festival นี้?")) return;
    await supabase.from("event_groups").delete().eq("id", id);
    toast({ title: "ลบ Festival สำเร็จ" });
    fetchGroups();
  };

  // Map readygo event IDs to names
  const getEventName = (id: string) => {
    const ev = readyGoEvents.find(e => e.id === id);
    return ev ? ev.title : id;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Festival / กลุ่มอีเวนท์</h2>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> สร้าง Festival
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        รวมอีเวนท์หลายงานเป็น Festival เดียว เพื่อสรุป P&L รวมในหน้าภาพรวม
      </p>

      {groups.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Layers className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>ยังไม่มี Festival กดปุ่ม "สร้าง Festival" เพื่อรวมอีเวนท์</p>
        </Card>
      )}

      {groups.map(g => (
        <Card key={g.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">{g.group_name}</h3>
                <Badge variant="outline" className="font-mono text-xs">
                  <Tag className="h-3 w-3 mr-1" />
                  {g.project_tag}
                </Badge>
                {g.festival_date && (
                  <Badge variant="secondary" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(g.festival_date).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </Badge>
                )}
              </div>
              {g.readygo_event_ids.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1">อีเวนท์ย่อย:</span>
                  {g.readygo_event_ids.map(id => (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {getEventName(id)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteGroup(g.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      <Dialog
        open={dialogOpen}
        onOpenChange={v => {
          setDialogOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "แก้ไข Festival" : "สร้าง Festival ใหม่"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>ชื่อ Festival</Label>
              <Input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="เช่น Terminal21 Festival"
              />
            </div>
            <div>
              <Label>Project Tag</Label>
              <Input
                value={projectTag}
                onChange={e => setProjectTag(e.target.value)}
                placeholder="เช่น EVT-Terminal21"
              />
              <p className="text-xs text-muted-foreground mt-1">
                ใช้ผูกกับค่าใช้จ่ายในระบบ
              </p>
            </div>
            <div>
              <Label>วันที่จัดงาน Festival</Label>
              <Input
                type="date"
                value={festivalDate}
                onChange={e => setFestivalDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ใช้เรียงลำดับในหน้าภาพรวม
              </p>
            </div>

            {readyGoEvents.length > 0 && (
              <div>
                <Label>เลือกอีเวนท์ย่อยจาก Ready-go</Label>
                <div className="border rounded-md p-3 mt-1 max-h-48 overflow-y-auto space-y-2">
                  {readyGoEvents.map(ev => (
                    <label
                      key={ev.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
                    >
                      <Checkbox
                        checked={selectedEventIds.includes(ev.id)}
                        onCheckedChange={() => toggleEventId(ev.id)}
                      />
                      <span className="text-sm flex-1">{ev.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {ev.event_date
                          ? new Date(ev.event_date).toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                            })
                          : ""}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedEventIds.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    เลือกแล้ว {selectedEventIds.length} อีเวนท์
                  </p>
                )}
              </div>
            )}

            <Button
              onClick={handleSave}
              className="w-full"
              disabled={!groupName || !projectTag}
            >
              {editingGroup ? "บันทึกการแก้ไข" : "สร้าง Festival"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
