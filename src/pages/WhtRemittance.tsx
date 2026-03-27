import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Download, CheckCircle2, Clock } from "lucide-react";

interface WhtExpense {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  staff_name: string | null;
  event_name: string | null;
  project_tag: string | null;
  receiver: string | null;
}

interface MonthGroup {
  key: string; // "2026-03"
  label: string; // "มีนาคม 2569"
  items: WhtExpense[];
  total: number;
}

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const WhtRemittance = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<WhtExpense[]>([]);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear() + 543));

  const years = useMemo(() => {
    const cy = now.getFullYear() + 543;
    return Array.from({ length: 5 }, (_, i) => String(cy - i));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    fetchData();
  }, [user, authLoading, selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const gregorianYear = Number(selectedYear) - 543;
    const startDate = `${gregorianYear}-01-01`;
    const endDate = `${gregorianYear + 1}-01-01`;

    const { data, error } = await supabase
      .from("expenses")
      .select("id, amount, expense_date, description, staff_name, event_name, project_tag, receiver")
      .eq("user_id", user.id)
      .eq("category", "ภาษีหัก ณ ที่จ่าย")
      .gte("expense_date", startDate)
      .lt("expense_date", endDate)
      .order("expense_date", { ascending: true });

    if (error) {
      toast({ title: "โหลดข้อมูลไม่สำเร็จ", variant: "destructive" });
    }
    setExpenses(data || []);
    setLoading(false);
  };

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, WhtExpense[]>();
    for (const e of expenses) {
      const key = e.expense_date.slice(0, 7); // "2026-03"
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }

    const groups: MonthGroup[] = [];
    for (const [key, items] of map) {
      const [y, m] = key.split("-").map(Number);
      groups.push({
        key,
        label: `${MONTHS_TH[m - 1]} ${y + 543}`,
        items,
        total: items.reduce((s, e) => s + e.amount, 0),
      });
    }
    return groups.sort((a, b) => a.key.localeCompare(b.key));
  }, [expenses]);

  const grandTotal = monthGroups.reduce((s, g) => s + g.total, 0);

  const exportCSV = () => {
    const headers = ["เดือน", "วันที่", "รายละเอียด", "ทีมงาน", "อีเวนท์", "โปรเจค", "จำนวนเงิน"];
    const rows = expenses.map((e) => {
      const [y, m] = e.expense_date.split("-").map(Number);
      return [
        `${MONTHS_TH[m - 1]} ${y + 543}`,
        new Date(e.expense_date).toLocaleDateString("th-TH"),
        e.description || "-",
        e.staff_name || "-",
        e.event_name || "-",
        e.project_tag || "-",
        e.amount,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ภาษีหัก_ณ_ที่จ่ายรอนำส่ง_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "ส่งออก CSV สำเร็จ" });
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-amber-600 to-orange-700 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Clock className="h-6 w-6" />
          <h1 className="text-lg font-bold">ภาษีหัก ณ ที่จ่าย — เครดิตรอนำส่ง</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Filter & Export */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">ปี:</span>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={expenses.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> ส่งออก CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/wht-report")}>
                  <FileText className="h-4 w-4 mr-1" /> รายงาน ภ.ง.ด.
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">รายการทั้งหมด</p>
              <p className="text-2xl font-bold">{expenses.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">ยอดรวมรอนำส่ง</p>
              <p className="text-2xl font-bold text-destructive">{grandTotal.toLocaleString()} ฿</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">จำนวนเดือน</p>
              <p className="text-2xl font-bold">{monthGroups.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Groups */}
        {monthGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>ไม่มีรายการภาษีหัก ณ ที่จ่ายในปี {selectedYear}</p>
            </CardContent>
          </Card>
        ) : (
          monthGroups.map((group) => (
            <Card key={group.key}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{group.label}</h3>
                    <Badge variant="secondary">{group.items.length} รายการ</Badge>
                  </div>
                  <p className="font-bold text-destructive">{group.total.toLocaleString()} ฿</p>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>วันที่</TableHead>
                        <TableHead>ทีมงาน</TableHead>
                        <TableHead>อีเวนท์</TableHead>
                        <TableHead>รายละเอียด</TableHead>
                        <TableHead className="text-right">จำนวนเงิน</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((e, i) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-sm">{new Date(e.expense_date).toLocaleDateString("th-TH")}</TableCell>
                          <TableCell className="font-medium">{e.staff_name || "-"}</TableCell>
                          <TableCell className="text-sm">{e.event_name || e.project_tag || "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.description || "-"}</TableCell>
                          <TableCell className="text-right font-semibold">{e.amount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5} className="text-right">รวม {group.label}</TableCell>
                        <TableCell className="text-right text-destructive">{group.total.toLocaleString()} ฿</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default WhtRemittance;
