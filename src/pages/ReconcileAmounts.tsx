import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, RefreshCw, Wand2, Scale } from "lucide-react";
import { AmountBreakdown } from "@/components/amount-breakdown";
import { formatBaht } from "@/lib/amount-model";

interface Row {
  id: string;
  amount: number;
  wht_amount: number;
  wht_rate: number;
  amount_input_mode: string | null;
  description: string | null;
  merchant: string | null;
  expense_date: string;
  suggested_gross: number;
  selected: boolean;
  done?: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * กฎ: amount ต้องเป็น Gross เสมอ → wht_amount ควรเท่ากับ amount * rate/100
 * ถ้า wht_amount ใกล้ amount * rate/(100-rate) มากกว่า แปลว่า amount ที่บันทึกไว้เป็น "ยอดสุทธิ"
 * ให้เสนอแก้เป็น Gross = amount + wht_amount
 */
function suggestGross(r: { amount: number; wht_amount: number; wht_rate: number }): number | null {
  const amount = Number(r.amount) || 0;
  const wht = Number(r.wht_amount) || 0;
  const rate = Number(r.wht_rate) || 0;
  if (amount <= 0 || wht <= 0 || rate <= 0 || rate >= 100) return null;

  const ifGross = round2((amount * rate) / 100);
  const ifNet = round2((amount * rate) / (100 - rate));
  const dGross = Math.abs(wht - ifGross);
  const dNet = Math.abs(wht - ifNet);
  // ถ้าตรงกับสมมติฐาน Gross อยู่แล้ว (คลาดเคลื่อน <= 1฿) ไม่ต้องแก้
  if (dGross <= 1) return null;
  if (dNet < dGross) return round2(amount + wht);
  return null;
}

export default function ReconcileAmounts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, amount, wht_amount, wht_rate, amount_input_mode, description, merchant, expense_date")
      .gt("wht_amount", 0)
      .order("expense_date", { ascending: false })
      .limit(3000);
    setLoading(false);
    if (error) {
      toast({ title: "โหลดข้อมูลไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    const found: Row[] = [];
    for (const r of data || []) {
      const suggested = suggestGross(r as any);
      if (suggested == null) continue;
      found.push({
        id: r.id,
        amount: Number(r.amount),
        wht_amount: Number(r.wht_amount),
        wht_rate: Number(r.wht_rate),
        amount_input_mode: r.amount_input_mode,
        description: r.description,
        merchant: r.merchant,
        expense_date: r.expense_date,
        suggested_gross: suggested,
        selected: true,
      });
    }
    setRows(found);
    toast({ title: `พบ ${found.length} รายการที่ยอดน่าจะเป็นยอดสุทธิ` });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fixOne = async (row: Row) => {
    const { error } = await supabase
      .from("expenses")
      .update({ amount: row.suggested_gross, amount_input_mode: "gross" })
      .eq("id", row.id);
    if (error) throw error;
  };

  const applySelected = async () => {
    const targets = rows.filter((r) => r.selected && !r.done);
    if (!targets.length) return;
    setSaving(true);
    let ok = 0;
    for (const r of targets) {
      try {
        await fixOne(r);
        ok++;
        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: true } : x)));
      } catch (e: any) {
        toast({ title: "แก้ไม่สำเร็จ", description: e.message, variant: "destructive" });
      }
    }
    setSaving(false);
    toast({ title: `แก้เป็นยอดเต็ม (Gross) แล้ว ${ok} รายการ` });
  };

  const pending = rows.filter((r) => !r.done);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" /> ตรวจยอด Gross vs ยอดสุทธิ
          </h1>
        </div>

        <Card className="p-4 text-sm text-muted-foreground">
          กฎของระบบ: <b className="text-foreground">ยอดค่าใช้จ่าย (amount) ต้องเป็นยอดเต็ม (Gross) เสมอ</b> และยอดโอนจริง = Gross − WHT
          <br />เครื่องมือนี้จะหารายการที่ดูเหมือนบันทึก "ยอดโอนจริง" ไว้ในช่องยอดค่าใช้จ่าย แล้วเสนอแก้เป็น Gross = ยอดเดิม + WHT
        </Card>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> สแกนใหม่
          </Button>
          <Button onClick={applySelected} disabled={saving || !pending.some((r) => r.selected)}>
            <Wand2 className="h-4 w-4 mr-1" /> แก้รายการที่เลือก ({pending.filter((r) => r.selected).length})
          </Button>
        </div>

        {!loading && rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
            ไม่พบรายการที่ยอดผิดหลัก Gross — ข้อมูลถูกต้องแล้ว
          </Card>
        )}

        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className={`p-3 ${r.done ? "opacity-60" : ""}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <Checkbox
                  checked={r.selected && !r.done}
                  disabled={r.done}
                  onCheckedChange={(c) =>
                    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, selected: !!c } : x)))
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.description || r.merchant || "ค่าใช้จ่าย"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.expense_date} • WHT {r.wht_rate}%
                    {r.amount_input_mode ? ` • โหมดกรอก: ${r.amount_input_mode}` : ""}
                  </div>
                </div>
                <div className="md:w-56">
                  <div className="text-xs text-muted-foreground mb-1">ปัจจุบัน</div>
                  <AmountBreakdown gross={r.amount} wht={r.wht_amount} whtRate={r.wht_rate} />
                </div>
                <div className="md:w-56">
                  <div className="text-xs text-muted-foreground mb-1">เสนอแก้เป็น</div>
                  <AmountBreakdown gross={r.suggested_gross} wht={r.wht_amount} whtRate={r.wht_rate} />
                </div>
                <div className="flex items-center gap-2">
                  {r.done ? (
                    <Badge className="bg-success/15 text-success border-success/30">แก้แล้ว</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await fixOne(r);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: true } : x)));
                          toast({ title: `แก้เป็น ${formatBaht(r.suggested_gross)} แล้ว` });
                        } catch (e: any) {
                          toast({ title: "แก้ไม่สำเร็จ", description: e.message, variant: "destructive" });
                        }
                      }}
                    >
                      ยืนยันแก้
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}