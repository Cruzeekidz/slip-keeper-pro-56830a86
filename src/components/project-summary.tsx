import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Folder, ExternalLink, ChevronRight, CalendarIcon } from "lucide-react";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProjectSummaryData {
  tag: string;
  totalAmount: number;
  count: number;
}

interface ExpenseDetail {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  merchant: string | null;
  subcategory: string | null;
  category_group: string | null;
  transaction_type: string | null;
  project_tag: string | null;
  receipt_url: string | null;
}

type PeriodPreset = "all" | "this-year" | "last-year" | "this-month" | "last-3m" | "last-6m" | "custom";

function getDateRange(preset: PeriodPreset): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "this-month": {
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const end = new Date(y, m + 1, 0);
      return { from: start, to: end.toISOString().slice(0, 10) };
    }
    case "last-3m": {
      const d = new Date(y, m - 2, 1);
      return { from: d.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    case "last-6m": {
      const d = new Date(y, m - 5, 1);
      return { from: d.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    default:
      return { from: null, to: null };
  }
}

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "this-month", label: "เดือนนี้" },
  { value: "last-3m", label: "3 เดือนล่าสุด" },
  { value: "last-6m", label: "6 เดือนล่าสุด" },
  { value: "this-year", label: `ปี ${new Date().getFullYear() + 543}` },
  { value: "last-year", label: `ปี ${new Date().getFullYear() + 542}` },
  { value: "custom", label: "กำหนดเอง..." },
];

export function ProjectSummary() {
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewBy, setViewBy] = useState<"project_tag" | "category_group">("project_tag");
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [details, setDetails] = useState<ExpenseDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('project_tag, category_group, transaction_type, amount, expense_date');
      if (error) throw error;
      setAllExpenses(data || []);
    } catch (error) {
      console.error('Error fetching project summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useExpensesRealtime(fetchAll);

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (period === "custom") {
      return {
        from: customFrom ? format(customFrom, 'yyyy-MM-dd') : null,
        to: customTo ? format(customTo, 'yyyy-MM-dd') : null,
      };
    }
    return getDateRange(period);
  }, [period, customFrom, customTo]);

  const projectData = useMemo(() => {
    const map = new Map<string, { totalAmount: number; count: number }>();

    allExpenses.forEach(expense => {
      if (expense.transaction_type === 'TRANSFER') return;
      if (dateFrom && expense.expense_date < dateFrom) return;
      if (dateTo && expense.expense_date > dateTo) return;

      const key = viewBy === "project_tag"
        ? expense.project_tag || 'ไม่ระบุแท็ก'
        : expense.transaction_type === 'BUSINESS'
          ? expense.category_group || 'ไม่ระบุกลุ่ม'
          : expense.transaction_type || 'ไม่ระบุ';

      const current = map.get(key) || { totalAmount: 0, count: 0 };
      map.set(key, { totalAmount: current.totalAmount + expense.amount, count: current.count + 1 });
    });

    return Array.from(map.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allExpenses, viewBy, dateFrom, dateTo]);

  const grandTotal = useMemo(() => projectData.reduce((s, d) => s + d.totalAmount, 0), [projectData]);
  const grandCount = useMemo(() => projectData.reduce((s, d) => s + d.count, 0), [projectData]);

  const fetchDetails = async (tag: string) => {
    setSelectedTag(tag);
    setDetailLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('id, amount, expense_date, description, merchant, subcategory, category_group, transaction_type, project_tag, receipt_url')
        .neq('transaction_type', 'TRANSFER')
        .order('expense_date', { ascending: false })
        .limit(500);

      if (dateFrom) query = query.gte('expense_date', dateFrom);
      if (dateTo) query = query.lte('expense_date', dateTo);

      if (viewBy === "project_tag") {
        if (tag === 'ไม่ระบุแท็ก') {
          query = query.is('project_tag', null);
        } else {
          query = query.eq('project_tag', tag);
        }
      } else {
        if (tag === 'ไม่ระบุกลุ่ม') {
          query = query.eq('transaction_type', 'BUSINESS').is('category_group', null);
        } else if (tag === 'PERSONAL' || tag === 'BUSINESS') {
          query = query.eq('transaction_type', tag);
        } else {
          query = query.eq('category_group', tag);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setDetails(data || []);
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;

  return (
    <>
      <Card className="p-6 bg-gradient-card shadow-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">สรุปยอด (ไม่รวม TRANSFER)</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {customFrom ? format(customFrom, 'dd/MM/yyyy') : "จากวันที่"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">ถึง</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {customTo ? format(customTo, 'dd/MM/yyyy') : "ถึงวันที่"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </>
            )}
            <Select value={viewBy} onValueChange={(v) => setViewBy(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="project_tag">ตามแท็กโปรเจค</SelectItem>
                <SelectItem value="category_group">ตามกลุ่ม</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{viewBy === "project_tag" ? "แท็กโปรเจค" : "กลุ่ม"}</TableHead>
                <TableHead className="text-right">จำนวน</TableHead>
                <TableHead className="text-right">ยอดรวม</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectData.map((item) => (
                <TableRow
                  key={item.tag}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fetchDetails(item.tag)}
                >
                  <TableCell className="font-medium">{item.tag}</TableCell>
                  <TableCell className="text-right">{item.count}</TableCell>
                  <TableCell className="text-right font-semibold text-expense">฿{item.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
              {projectData.length > 1 && (
                <TableRow className="border-t-2 font-bold">
                  <TableCell>รวมทั้งหมด</TableCell>
                  <TableCell className="text-right">{grandCount}</TableCell>
                  <TableCell className="text-right text-expense">฿{grandTotal.toLocaleString()}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selectedTag} onOpenChange={(open) => !open && setSelectedTag(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-primary" />
              {selectedTag}
              <span className="text-sm font-normal text-muted-foreground">
                ({details.length} รายการ)
              </span>
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-auto flex-1 -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead>ประเภทย่อย</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((item) => (
                    <TableRow key={item.id} className="group">
                      <TableCell className="text-sm whitespace-nowrap">{item.expense_date}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {item.description || item.merchant || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.subcategory || '-'}</TableCell>
                      <TableCell className="text-right font-medium text-expense whitespace-nowrap">
                        ฿{item.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(null);
                            navigate(`/?edit=${item.id}`);
                          }}
                          title="ดู/แก้ไข"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {details.length === 0 && (
                <p className="text-center text-muted-foreground py-8">ไม่พบรายการ</p>
              )}
              {details.length > 0 && (
                <div className="py-3 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{details.length} รายการ</span>
                  <span className="font-semibold text-expense">
                    รวม ฿{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
