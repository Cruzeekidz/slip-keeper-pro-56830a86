import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildEventOptions, EventTagOption, formatThaiShortDate } from "@/lib/event-tags";
import { PRIMARY_PREFIX, EVENT_CODE_HELP } from "@/lib/memo-event-code";

/** รหัสที่ต้องพิมพ์ในช่องบันทึกช่วยจำ = @ + tag ที่ตัด EVT- ออก */
function memoCodeForTag(tag: string): string {
  const t = tag.trim().toUpperCase();
  return PRIMARY_PREFIX + (t.startsWith("EVT-") ? t.slice(4) : t);
}

export default function EventCodes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<EventTagOption[]>([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("event_registry")
        .select("event_name, project_tag, event_date, is_active, entity")
        .eq("is_active", true)
        .limit(2000);
      setRows(buildEventOptions((data as any[]) || []));
    })();
  }, []);

  const nearby = useMemo(() => rows.filter((r) => r.inWindow), [rows]);
  const others = useMemo(() => rows.filter((r) => !r.inWindow), [rows]);

  const filter = (list: EventTagOption[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) => r.name.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q),
    );
  };

  const copy = async (tag: string) => {
    const code = memoCodeForTag(tag);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
      toast({ title: `ก็อปแล้ว: ${code}` });
    } catch {
      toast({ title: "ก็อปไม่สำเร็จ", description: code, variant: "destructive" });
    }
  };

  const renderList = (list: EventTagOption[]) =>
    list.length === 0 ? (
      <p className="text-sm text-muted-foreground">ไม่พบรายการ</p>
    ) : (
      <div className="space-y-2">
        {list.map((r) => (
          <div
            key={r.tag}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
          >
            <div className="min-w-0">
              <div className="font-mono text-base font-semibold text-primary">
                {memoCodeForTag(r.tag)}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {r.name}
                {r.date ? ` · ${formatThaiShortDate(r.date)}` : ""}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => copy(r.tag)}>
              {copied === r.tag ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1">ก็อปรหัส</span>
            </Button>
          </div>
        ))}
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="mb-4">
        <ArrowLeft className="mr-1 h-4 w-4" /> กลับ
      </Button>

      <h1 className="mb-2 text-2xl font-bold">รหัสงานที่ใช้ได้ตอนนี้</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {EVENT_CODE_HELP} — แอพธนาคารส่วนใหญ่พิมพ์ <span className="font-mono">#</span> ไม่ได้
        ระบบยังอ่าน <span className="font-mono">#</span> ของสลิปเก่าได้เหมือนเดิม
        รหัสต้องตรงทั้งคำ ถ้าไม่ตรงทะเบียนระบบจะไม่เดาให้ แต่จะส่งเข้ารายการรอตรวจ
      </p>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่องานหรือรหัส"
          className="pl-9"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              งานช่วงนี้ <Badge variant="secondary">{nearby.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>{renderList(filter(nearby))}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              งานอื่น ๆ <Badge variant="outline">{others.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>{renderList(filter(others))}</CardContent>
        </Card>
      </div>
    </div>
  );
}
