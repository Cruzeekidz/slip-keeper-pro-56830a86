import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";

interface RegistryEvent {
  id: string;
  event_name: string;
  project_tag: string;
  event_date: string | null;
  readygo_event_id: string | null;
}

interface RowResult {
  event: RegistryEvent;
  kitQty: number;
  kitAmount: number;
  registrations: number | null;
  error?: string;
}

export default function RaceKitReport() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RowResult[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: events } = await supabase
        .from("event_registry")
        .select("id, event_name, project_tag, event_date, readygo_event_id")
        .not("readygo_event_id", "is", null)
        .order("event_date", { ascending: false, nullsFirst: false })
        .limit(40);

      const list = (events as RegistryEvent[]) || [];
      const tags = list.map((e) => e.project_tag);

      const { data: kits } = await supabase
        .from("expenses")
        .select("project_tag, item_quantity, amount")
        .eq("subcategory", "race_kit")
        .in("project_tag", tags.length ? tags : ["__none__"])
        .limit(5000);

      const kitByTag = new Map<string, { qty: number; amount: number }>();
      for (const k of (kits as any[]) || []) {
        const cur = kitByTag.get(k.project_tag) || { qty: 0, amount: 0 };
        cur.qty += Number(k.item_quantity) || 0;
        cur.amount += Number(k.amount) || 0;
        kitByTag.set(k.project_tag, cur);
      }

      const results = await Promise.all(
        list.map(async (ev) => {
          const kit = kitByTag.get(ev.project_tag) || { qty: 0, amount: 0 };
          let registrations: number | null = null;
          let error: string | undefined;
          try {
            const { data, error: fnErr } = await supabase.functions.invoke("fetch-readygo-data", {
              body: { action: "event-financials", event_id: ev.readygo_event_id },
            });
            if (fnErr) throw fnErr;
            registrations = Number(data?.registrationStats?.total_registrations ?? 0);
          } catch (e) {
            error = e instanceof Error ? e.message : "ดึงข้อมูล ReadyGo ไม่ได้";
          }
          return { event: ev, kitQty: kit.qty, kitAmount: kit.amount, registrations, error };
        }),
      );

      setRows(results.filter((r) => r.kitQty > 0 || r.kitAmount > 0 || (r.registrations ?? 0) > 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" /> กระทบยอด Race Kit
            </h1>
            <p className="text-sm text-muted-foreground">
              เทียบจำนวน Race Kit ที่สั่งซื้อ กับจำนวนผู้สมัครใน ReadyGo
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> โหลดใหม่
          </Button>
        </div>

        <Card className="p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีรายการหมวด Race Kit ที่ระบุจำนวนชิ้น — เวลาบันทึกค่าใช้จ่าย ให้เลือกหมวด "Race Kit" แล้วกรอกจำนวนชิ้น
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">งาน</th>
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="py-2 pr-3 text-right">สั่ง Race Kit (ชิ้น)</th>
                    <th className="py-2 pr-3 text-right">ผู้สมัคร ReadyGo</th>
                    <th className="py-2 pr-3 text-right">ส่วนต่าง</th>
                    <th className="py-2 text-right">ยอดเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const diff = r.registrations == null ? null : r.kitQty - r.registrations;
                    return (
                      <tr key={r.event.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          {r.event.event_name}
                          <span className="text-xs text-muted-foreground ml-2">{r.event.project_tag}</span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.event.event_date || "-"}</td>
                        <td className="py-2 pr-3 text-right">{r.kitQty || "-"}</td>
                        <td className="py-2 pr-3 text-right">
                          {r.error ? <span className="text-xs text-destructive">{r.error}</span> : r.registrations ?? "-"}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {diff == null ? "-" : (
                            <Badge variant="outline" className={diff === 0 ? "border-emerald-500/40 text-emerald-500" : "border-amber-500/40 text-amber-500"}>
                              {diff > 0 ? `+${diff}` : diff}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 text-right font-medium">{r.kitAmount.toLocaleString("th-TH")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
