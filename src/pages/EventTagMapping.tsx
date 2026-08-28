import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Link2, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { EventTagPicker } from "@/components/event-tag-picker";
import { eventOptionLabel, formatThaiShortDate } from "@/lib/event-tags";

interface LegacyTag {
  tag: string;
  count: number;
}

interface RegistryRow {
  id: string;
  event_name: string;
  project_tag: string;
  event_date: string | null;
  aliases: string[];
}

/**
 * Manual mapping of legacy project tags to ReadyGo-synced events.
 * Never auto-matched by venue name — a human confirms every pair.
 */
const EventTagMapping = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [legacy, setLegacy] = useState<LegacyTag[]>([]);
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  const load = async () => {
    if (!user) return;
    setBusy(true);
    const [expRes, regRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("project_tag")
        .eq("user_id", user.id)
        .not("project_tag", "is", null)
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("event_registry")
        .select("id, event_name, project_tag, event_date, aliases")
        .eq("user_id", user.id),
    ]);

    const rows = (regRes.data as RegistryRow[]) || [];
    setRegistry(rows);

    const known = new Set<string>();
    rows.forEach((r) => {
      if (r.project_tag) known.add(r.project_tag);
      (r.aliases || []).forEach((a) => known.add(a));
    });

    const counts = new Map<string, number>();
    for (const e of (expRes.data as any[]) || []) {
      const t = (e.project_tag || "").trim();
      if (!t || known.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    setLegacy([...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
    setBusy(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? legacy.filter((l) => l.tag.toLowerCase().includes(q)) : legacy;
  }, [legacy, query]);

  const linkTag = async (tag: string) => {
    const targetTag = picks[tag];
    const target = registry.find((r) => r.project_tag === targetTag);
    if (!target) {
      toast({ title: "กรุณาเลือกงานที่จะจับคู่", variant: "destructive" });
      return;
    }
    setSaving(tag);
    const nextAliases = [...new Set([...(target.aliases || []), tag])];
    const { error } = await supabase
      .from("event_registry")
      .update({ aliases: nextAliases })
      .eq("id", target.id);
    setSaving(null);
    if (error) {
      toast({ title: "จับคู่ไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `จับคู่ ${tag} → ${target.event_name} แล้ว` });
    setPicks((p) => {
      const { [tag]: _, ...rest } = p;
      return rest;
    });
    load();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/event-management")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">จับคู่แท็กเก่ากับงานในระบบ</h1>
            <p className="text-sm text-muted-foreground">
              เลือกแท็กเดิม → เลือกงานจริง แท็กเก่าจะถูกเก็บเป็น alias ของงานนั้น (ต้องกดยืนยันเองทุกครั้ง)
            </p>
          </div>
        </div>

        <Card className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาแท็กเก่า..."
              className="pl-8"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ยังไม่ผูก {legacy.length} แท็ก
          </p>
        </Card>

        {busy && (
          <Card className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto animate-spin" />
          </Card>
        )}

        {!busy && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">ไม่มีแท็กที่ต้องจับคู่</Card>
        )}

        <div className="space-y-3">
          {filtered.map((l) => (
            <Card key={l.tag} className="p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="md:w-1/3 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">{l.tag}</Badge>
                  <span className="text-xs text-muted-foreground">{l.count} รายการ</span>
                </div>
                <div className="flex-1">
                  <EventTagPicker
                    value={picks[l.tag] || ""}
                    onValueChange={(tag) => setPicks((p) => ({ ...p, [l.tag]: tag }))}
                    placeholder="เลือกงานที่จะจับคู่"
                  />
                </div>
                <Button
                  onClick={() => linkTag(l.tag)}
                  disabled={!picks[l.tag] || saving === l.tag}
                  className="shrink-0"
                >
                  {saving === l.tag ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                  ยืนยันจับคู่
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <h2 className="font-semibold mb-2">งานในระบบ ({registry.length})</h2>
          <div className="flex flex-wrap gap-2">
            {registry.map((r) => (
              <Badge key={r.id} variant="secondary" className="text-xs">
                {eventOptionLabel({ tag: r.project_tag, name: r.event_name, date: r.event_date })}
                {(r.aliases || []).length > 0 && ` · alias ${r.aliases.length}`}
              </Badge>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default EventTagMapping;
