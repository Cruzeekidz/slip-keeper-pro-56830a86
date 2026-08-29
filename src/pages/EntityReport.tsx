import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Building2 } from "lucide-react";
import { ENTITIES, entityLabel, entityBadgeClass, NON_MENGXIN_ENTITIES } from "@/lib/entity";
import { subcategoryLabel } from "@/lib/category-constants";

interface Row {
  id: string;
  expense_date: string;
  amount: number;
  entity: string | null;
  transaction_type: string | null;
  transaction_direction: string;
  category_group: string | null;
  project_tag: string | null;
  event_name: string | null;
  subcategory: string | null;
  receiver: string | null;
  merchant: string | null;
  description: string | null;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export default function EntityReport() {
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [y, m] = month.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const endDate = new Date(y, m, 0);
      const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      const { data } = await supabase
        .from("expenses")
        .select("id, expense_date, amount, entity, transaction_type, transaction_direction, category_group, project_tag, event_name, subcategory, receiver, merchant, description")
        .gte("expense_date", start)
        .lte("expense_date", end)
        .neq("transaction_type", "TRANSFER")
        .order("expense_date", { ascending: true })
        .limit(5000);

      if (cancelled) return;
      setRows((data as Row[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [month]);

  const byEntity = useMemo(() => {
    const map = new Map<string, { expense: number; income: number; count: number }>();
    for (const e of ENTITIES) map.set(e.value, { expense: 0, income: 0, count: 0 });
    for (const r of rows) {
      const key = r.entity || "MENGXIN";
      const cur = map.get(key) || { expense: 0, income: 0, count: 0 };
      if (r.transaction_direction === "INCOME") cur.income += Number(r.amount) || 0;
      else cur.expense += Number(r.amount) || 0;
      cur.count += 1;
      map.set(key, cur);
    }
    return map;
  }, [rows]);

  const nonMengxinRows = useMemo(
    () => rows.filter((r) => NON_MENGXIN_ENTITIES.includes((r.entity || "MENGXIN") as any)),
    [rows],
  );

  const nonMengxinTotal = nonMengxinRows
    .filter((r) => r.transaction_direction !== "INCOME")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const exportCsv = () => {
    const headers = ["วันที่", "หน่วยธุรกิจ", "ประเภท", "กลุ่ม", "แท็กงาน", "ชื่องาน", "หมวดย่อย", "ผู้รับเงิน", "รายละเอียด", "จำนวนเงิน"];
    const lines = [headers.join(",")];
    for (const r of nonMengxinRows) {
      lines.push([
        r.expense_date,
        entityLabel(r.entity),
        r.transaction_direction === "INCOME" ? "รายรับ" : "รายจ่าย",
        r.category_group || "",
        r.project_tag || "",
        r.event_name || "",
        subcategoryLabel(r.subcategory),
        r.receiver || r.merchant || "",
        r.description || "",
        r.amount,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `non-mengxin-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin-tools")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" /> รายงานตามหน่วยธุรกิจ
            </h1>
            <p className="text-sm text-muted-foreground">
              แยกว่าเงินก้อนไหนเป็นของเม้งซิน และก้อนไหนไม่ใช่เงินบริษัท
            </p>
          </div>
        </div>

        <Card className="p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>เดือน</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!nonMengxinRows.length}>
            <Download className="h-4 w-4 mr-2" /> ดาวน์โหลดรายการที่ไม่ใช่เม้งซิน
          </Button>
        </Card>

        <Card className="p-4 bg-muted/40">
          <p className="text-sm text-muted-foreground">
            {monthLabel(month)} — ยอดที่ <b>ไม่ใช่</b> เงินเม้งซิน
          </p>
          <p className="text-3xl font-bold">
            {nonMengxinTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
          </p>
          <p className="text-xs text-muted-foreground mt-1">{nonMengxinRows.length} รายการ (ไม่รวมรายการโอนเงิน)</p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {ENTITIES.map((e) => {
            const v = byEntity.get(e.value) || { expense: 0, income: 0, count: 0 };
            return (
              <Card key={e.value} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={entityBadgeClass(e.value)}>{e.label}</Badge>
                  {!e.isCompany && <span className="text-[10px] text-muted-foreground">ไม่ใช่เงินบริษัท</span>}
                </div>
                <p className="text-xl font-bold">{v.expense.toLocaleString("th-TH")} ฿</p>
                {v.income > 0 && (
                  <p className="text-xs text-emerald-500">รายรับ {v.income.toLocaleString("th-TH")} ฿</p>
                )}
                <p className="text-xs text-muted-foreground">{v.count} รายการ</p>
              </Card>
            );
          })}
        </div>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">รายการที่ไม่ใช่เงินเม้งซิน</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : nonMengxinRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">เดือนนี้ไม่มีรายการที่ไม่ใช่เงินเม้งซิน</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="py-2 pr-3">หน่วยธุรกิจ</th>
                    <th className="py-2 pr-3">งาน</th>
                    <th className="py-2 pr-3">หมวดย่อย</th>
                    <th className="py-2 pr-3">ผู้รับเงิน</th>
                    <th className="py-2 pr-3">รายละเอียด</th>
                    <th className="py-2 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {nonMengxinRows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{r.expense_date}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className={entityBadgeClass(r.entity)}>{entityLabel(r.entity)}</Badge>
                      </td>
                      <td className="py-2 pr-3">{r.event_name || r.project_tag || "-"}</td>
                      <td className="py-2 pr-3">{subcategoryLabel(r.subcategory)}</td>
                      <td className="py-2 pr-3">{r.receiver || r.merchant || "-"}</td>
                      <td className="py-2 pr-3 max-w-[320px] truncate">{r.description || "-"}</td>
                      <td className="py-2 text-right font-medium">{Number(r.amount).toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
