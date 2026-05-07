import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CalendarIcon, ChevronRight, ExternalLink, Building2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_GROUPS } from "@/lib/category-constants";

type Preset = "this-month" | "last-3m" | "this-year" | "last-year" | "all" | "custom";

interface Row {
  id: string;
  amount: number;
  vat_amount: number | null;
  wht_amount: number | null;
  expense_date: string;
  description: string | null;
  merchant: string | null;
  receiver: string | null;
  staff_name: string | null;
  subcategory: string | null;
  category: string | null;
  category_group: string | null;
  project_tag: string | null;
}

function getRange(p: Preset): { from: string | null; to: string | null } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (p) {
    case "this-month": return { from: `${y}-${String(m+1).padStart(2,"0")}-01`, to: new Date(y, m+1, 0).toISOString().slice(0,10) };
    case "last-3m": return { from: new Date(y, m-2, 1).toISOString().slice(0,10), to: now.toISOString().slice(0,10) };
    case "this-year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year": return { from: `${y-1}-01-01`, to: `${y-1}-12-31` };
    default: return { from: null, to: null };
  }
}

const ReimbursementSummary = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<Preset>("this-year");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [groupBy, setGroupBy] = useState<"category_group" | "merchant" | "project_tag">("category_group");
  const [drill, setDrill] = useState<{ key: string; rows: Row[] } | null>(null);

  useEffect(() => { if (!loading && !user) navigate("/auth"); }, [user, loading, navigate]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") return {
      from: customFrom ? format(customFrom, "yyyy-MM-dd") : null,
      to: customTo ? format(customTo, "yyyy-MM-dd") : null,
    };
    return getRange(preset);
  }, [preset, customFrom, customTo]);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["reimburse-summary", from, to],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("id, amount, vat_amount, wht_amount, expense_date, description, merchant, receiver, staff_name, subcategory, category, category_group, project_tag")
        .eq("transaction_type", "BUSINESS")
        .eq("transaction_direction", "EXPENSE")
        .order("expense_date", { ascending: false })
        .limit(2000);
      if (from) q = q.gte("expense_date", from);
      if (to) q = q.lte("expense_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!user,
  });

  const reimburseRows = rows.filter((r) => r.subcategory === "เบิกคืนทีมงาน");
  const directRows = rows.filter((r) => r.subcategory !== "เบิกคืนทีมงาน");

  const aggregate = (list: Row[]) => {
    const map = new Map<string, { count: number; gross: number; vat: number; wht: number; expense: number; rows: Row[] }>();
    for (const r of list) {
      const k =
        groupBy === "category_group"
          ? (CATEGORY_GROUPS.find((g) => g.value === r.category_group)?.label || r.category_group || "ไม่ระบุ")
          : groupBy === "project_tag"
          ? (r.project_tag || "ไม่ระบุแท็ก")
          : (r.merchant || r.receiver || r.staff_name || "ไม่ระบุ");
      const cur = map.get(k) || { count: 0, gross: 0, vat: 0, wht: 0, expense: 0, rows: [] };
      const gross = Number(r.amount || 0);
      const vat = Number(r.vat_amount || 0);
      const wht = Number(r.wht_amount || 0);
      // ค่าใช้จ่ายจริง (P&L) = Gross − VAT (ถ้ามี VAT แสดงว่าเคลม Input ได้)
      const expense = gross - vat;
      cur.count += 1;
      cur.gross += gross;
      cur.vat += vat;
      cur.wht += wht;
      cur.expense += expense;
      cur.rows.push(r);
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, cash: v.gross - v.wht }))
      .sort((a, b) => b.expense - a.expense);
  };

  const directAgg = aggregate(directRows);
  const reimburseAgg = aggregate(reimburseRows);

  const totals = (list: ReturnType<typeof aggregate>) =>
    list.reduce((s, r) => ({ count: s.count + r.count, gross: s.gross + r.gross, vat: s.vat + r.vat, wht: s.wht + r.wht, expense: s.expense + r.expense, cash: s.cash + r.cash }),
      { count: 0, gross: 0, vat: 0, wht: 0, expense: 0, cash: 0 });

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  const renderTable = (list: ReturnType<typeof aggregate>, color: string) => {
    const t = totals(list);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupBy === "category_group" ? "กลุ่ม" : groupBy === "project_tag" ? "แท็กโปรเจ็ค" : "ร้าน/ผู้รับ"}</TableHead>
            <TableHead className="text-right">รายการ</TableHead>
            <TableHead className="text-right" title="ค่าใช้จ่ายจริงใน P&L (Gross − VAT)">ค่าใช้จ่าย</TableHead>
            <TableHead className="text-right text-muted-foreground" title="Input VAT เคลมคืนได้">VAT เคลม</TableHead>
            <TableHead className="text-right text-muted-foreground" title="ยอดในบิล (Base + VAT)">Gross</TableHead>
            <TableHead className="text-right text-amber-600" title="หัก ณ ที่จ่าย (Liability — นำส่งสรรพากร)">WHT</TableHead>
            <TableHead className="text-right" title="เงินสดที่จ่ายจริง = Gross − WHT">เงินสดจ่าย</TableHead>
            <TableHead className="w-8"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.key} className="cursor-pointer hover:bg-muted/50" onClick={() => setDrill({ key: r.key, rows: r.rows })}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
              <TableCell className={cn("text-right font-bold", color)}>฿{r.expense.toLocaleString()}</TableCell>
              <TableCell className="text-right text-muted-foreground">{r.vat > 0 ? `฿${r.vat.toLocaleString()}` : "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">฿{r.gross.toLocaleString()}</TableCell>
              <TableCell className="text-right text-amber-600">{r.wht > 0 ? `฿${r.wht.toLocaleString()}` : "—"}</TableCell>
              <TableCell className="text-right">฿{r.cash.toLocaleString()}</TableCell>
              <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">ไม่พบรายการ</TableCell></TableRow>
          )}
          {list.length > 0 && (
            <TableRow className="border-t-2 font-bold">
              <TableCell>รวม</TableCell>
              <TableCell className="text-right">{t.count}</TableCell>
              <TableCell className={cn("text-right", color)}>฿{t.expense.toLocaleString()}</TableCell>
              <TableCell className="text-right text-muted-foreground">฿{t.vat.toLocaleString()}</TableCell>
              <TableCell className="text-right text-muted-foreground">฿{t.gross.toLocaleString()}</TableCell>
              <TableCell className="text-right text-amber-600">฿{t.wht.toLocaleString()}</TableCell>
              <TableCell className="text-right">฿{t.cash.toLocaleString()}</TableCell>
              <TableCell />
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">สรุปค่าใช้จ่าย: บริษัทตรง vs เบิกคืนทีมงาน</h1>
            <p className="text-primary-foreground/80 text-sm">แยกตามกลุ่ม / ร้าน / แท็กโปรเจ็ค</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        <Card className="p-4 flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">เดือนนี้</SelectItem>
              <SelectItem value="last-3m">3 เดือนล่าสุด</SelectItem>
              <SelectItem value="this-year">ปี {new Date().getFullYear() + 543}</SelectItem>
              <SelectItem value="last-year">ปี {new Date().getFullYear() + 542}</SelectItem>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="custom">กำหนดเอง...</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {customFrom ? format(customFrom, "dd/MM/yyyy") : "จาก"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {customTo ? format(customTo, "dd/MM/yyyy") : "ถึง"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </>
          )}
          <div className="flex-1" />
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="category_group">ตามกลุ่ม</SelectItem>
              <SelectItem value="merchant">ตามร้าน/ผู้รับ</SelectItem>
              <SelectItem value="project_tag">ตามแท็กโปรเจ็ค</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        {isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">กำลังโหลด...</Card>
        ) : (
          <>
          <Card className="p-3 text-xs text-muted-foreground bg-muted/30">
            <div className="font-semibold text-foreground mb-1">วิธีอ่านตัวเลข</div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
              <div>• <b className="text-foreground">ค่าใช้จ่าย</b> = Gross − VAT (ถ้ามี VAT) — ตัวเลขที่ลง P&L</div>
              <div>• <b>VAT เคลม</b> = Input VAT ที่ขอคืนได้ (ไม่ใช่ค่าใช้จ่าย)</div>
              <div>• <b>Gross</b> = ยอดในใบกำกับ/บิล (Base + VAT)</div>
              <div>• <b className="text-amber-600">WHT</b> = หัก ณ ที่จ่าย (Liability — นำส่งสรรพากร, ไม่ใช่ค่าใช้จ่าย)</div>
              <div>• <b>เงินสดจ่าย</b> = Gross − WHT (ตรงกับสลิปโอน)</div>
              <div>• บิลไม่มี VAT: ค่าใช้จ่าย = Gross</div>
            </div>
          </Card>
          <Tabs defaultValue="compare">
            <TabsList>
              <TabsTrigger value="compare">เปรียบเทียบ</TabsTrigger>
              <TabsTrigger value="direct"><Building2 className="h-3 w-3 mr-1" />บริษัทตรง</TabsTrigger>
              <TabsTrigger value="reimburse"><Users className="h-3 w-3 mr-1" />เบิกคืนทีมงาน</TabsTrigger>
            </TabsList>
            <TabsContent value="compare" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <h2 className="font-bold mb-2 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> ค่าใช้จ่ายบริษัทตรง</h2>
                {renderTable(directAgg, "text-expense")}
              </Card>
              <Card className="p-4">
                <h2 className="font-bold mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-amber-500" /> เบิกคืนทีมงาน</h2>
                {renderTable(reimburseAgg, "text-amber-600")}
              </Card>
            </TabsContent>
            <TabsContent value="direct">
              <Card className="p-4">{renderTable(directAgg, "text-expense")}</Card>
            </TabsContent>
            <TabsContent value="reimburse">
              <Card className="p-4">{renderTable(reimburseAgg, "text-amber-600")}</Card>
            </TabsContent>
          </Tabs>
          </>
        )}
      </main>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{drill?.key} ({drill?.rows.length} รายการ)</DialogTitle></DialogHeader>
          <div className="overflow-auto flex-1 -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>รายละเอียด</TableHead>
                  <TableHead>ร้าน/ผู้รับ</TableHead>
                  <TableHead className="text-right">ยอด</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drill?.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.expense_date}</TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate">{r.description || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.merchant || r.receiver || r.staff_name || "-"}</TableCell>
                    <TableCell className="text-right font-medium">฿{Number(r.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDrill(null); navigate(`/?edit=${r.id}`); }} title="ดู/แก้ไข">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReimbursementSummary;