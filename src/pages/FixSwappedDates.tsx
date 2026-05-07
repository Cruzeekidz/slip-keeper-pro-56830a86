import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CalendarClock, CheckCircle, RefreshCw, Wand2 } from "lucide-react";

interface Row {
  id: string;
  amount: number;
  description: string | null;
  merchant: string | null;
  expense_date: string; // YYYY-MM-DD
  created_at: string;
  suggested_date: string;
  selected: boolean;
}

/**
 * DD/YY swap detection (mirrors line-webhook + analyze-receipt logic).
 * If expense_date year is far in the past (< createdYear - 1) AND day is >= 20,
 * swap: newYear = 2000 + day, newDay = year % 100.
 * Returns null if no swap suggested.
 */
function suggestSwap(expenseDate: string, createdAt: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expenseDate);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const createdYear = new Date(createdAt).getFullYear();

  if (year >= createdYear - 1) return null; // not stale
  if (day < 20) return null; // can't be a year suffix

  const newYear = 2000 + day;
  const newDay = year % 100;
  if (newDay < 1 || newDay > 31) return null;
  if (newYear > createdYear + 1) return null;

  // Validate the resulting date
  const d = new Date(newYear, month - 1, newDay);
  if (
    d.getFullYear() !== newYear ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== newDay
  )
    return null;

  const mm = String(month).padStart(2, "0");
  const dd = String(newDay).padStart(2, "0");
  return `${newYear}-${mm}-${dd}`;
}

export default function FixSwappedDates() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    // Pull suspicious candidates: expense_date year <= 2024 (broad net), then filter client-side.
    const { data, error } = await supabase
      .from("expenses")
      .select("id, amount, description, merchant, expense_date, created_at")
      .eq("user_id", user.id)
      .lte("expense_date", "2024-12-31")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast({ title: "โหลดข้อมูลไม่สำเร็จ", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const candidates: Row[] = [];
    for (const r of data || []) {
      const sug = suggestSwap(r.expense_date, r.created_at);
      if (sug && sug !== r.expense_date) {
        candidates.push({
          id: r.id,
          amount: Number(r.amount),
          description: r.description,
          merchant: r.merchant,
          expense_date: r.expense_date,
          created_at: r.created_at,
          suggested_date: sug,
          selected: true,
        });
      }
    }
    setRows(candidates);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const toggle = (id: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));

  const toggleAll = (val: boolean) =>
    setRows((rs) => rs.map((r) => ({ ...r, selected: val })));

  const apply = async () => {
    const targets = rows.filter((r) => r.selected);
    if (!targets.length) return;
    if (!confirm(`ยืนยันแก้วันที่ ${targets.length} รายการ?`)) return;
    setApplying(true);
    let ok = 0;
    let fail = 0;
    for (const r of targets) {
      const { error } = await supabase
        .from("expenses")
        .update({ expense_date: r.suggested_date, needs_review: false })
        .eq("id", r.id);
      if (error) fail++;
      else ok++;
    }
    setApplying(false);
    toast({
      title: "แก้วันที่เสร็จสิ้น",
      description: `สำเร็จ ${ok} รายการ${fail ? ` / ล้มเหลว ${fail}` : ""}`,
    });
    load();
  };

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CalendarClock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">แก้วันที่อัตโนมัติ (DD/YY สลับ)</h1>
        </div>

        <Card className="p-4 text-sm text-muted-foreground">
          ตรวจหารายการที่ OCR อ่านวันที่สลับกับปี (เช่น 23/04/26 → 2023-04-26 แทน 2026-04-23)
          แล้วเสนอวันที่ที่ถูกต้องให้กดยืนยัน
        </Card>

        <Card className="p-4">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">กำลังตรวจสอบ...</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
              <p className="text-muted-foreground">ไม่พบรายการที่ต้องแก้ 🎉</p>
              <Button variant="outline" className="mt-4 gap-2" onClick={load}>
                <RefreshCw className="h-4 w-4" /> ตรวจอีกครั้ง
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    id="all"
                  />
                  <label htmlFor="all" className="text-sm font-medium">
                    เลือกทั้งหมด ({rows.length})
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={load} disabled={applying} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${applying ? "animate-spin" : ""}`} /> รีเฟรช
                  </Button>
                  <Button
                    onClick={apply}
                    disabled={applying || !rows.some((r) => r.selected)}
                    className="gap-2"
                  >
                    <Wand2 className="h-4 w-4" />
                    แก้วันที่อัตโนมัติ ({rows.filter((r) => r.selected).length})
                  </Button>
                </div>
              </div>

              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 py-2 px-2 border-b last:border-0 hover:bg-muted/40 rounded"
                  >
                    <Checkbox checked={r.selected} onCheckedChange={() => toggle(r.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {r.merchant || r.description || "(ไม่มีรายละเอียด)"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ยอด {r.amount.toLocaleString()} ฿
                      </div>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      <div className="text-destructive line-through">{r.expense_date}</div>
                      <div className="text-success font-semibold">→ {r.suggested_date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}