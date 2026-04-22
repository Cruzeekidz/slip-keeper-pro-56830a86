import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Wallet, Users, History, Trash2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import {
  useCashAdvances,
  useDeleteCashAdvance,
  useWriteOffAdvance,
  type CashAdvance,
  summariseByPerson,
} from "@/hooks/useCashAdvances";
import { AddAdvanceDialog } from "@/components/cash-advance/AddAdvanceDialog";
import { ClearAdvanceDialog } from "@/components/cash-advance/ClearAdvanceDialog";
import { ClearancesDialog } from "@/components/cash-advance/ClearancesDialog";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const statusBadge = (status: string) => {
  if (status === "cleared")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">เคลียร์แล้ว</Badge>;
  if (status === "partial")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">เคลียร์บางส่วน</Badge>;
  if (status === "written_off")
    return <Badge variant="secondary">ตัดเป็นค่าใช้จ่าย</Badge>;
  return <Badge variant="destructive">ค้างชำระ</Badge>;
};

const CashAdvancePage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { data: advances = [], isLoading } = useCashAdvances();
  const deleteAdvance = useDeleteCashAdvance();
  const writeOff = useWriteOffAdvance();

  const [showAdd, setShowAdd] = useState(false);
  const [clearTarget, setClearTarget] = useState<CashAdvance | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CashAdvance | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const outstanding = useMemo(
    () => advances.filter((a) => a.status === "outstanding" || a.status === "partial"),
    [advances]
  );
  const history = advances;
  const perPerson = useMemo(() => summariseByPerson(advances), [advances]);

  const totalOutstanding = outstanding.reduce(
    (s, a) => s + Math.max(0, Number(a.amount) - Number(a.cleared_amount)),
    0
  );

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-primary-foreground hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6" /> เงินทดรองจ่าย
            </h1>
            <p className="text-primary-foreground/80 text-sm">
              คงค้าง {fmt(totalOutstanding)} บาท · ทั้งหมด {advances.length} รายการ
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="bg-white text-primary hover:bg-white/90">
            <Plus className="h-4 w-4 mr-2" /> โอนทดรอง
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Tabs defaultValue="outstanding" className="space-y-4">
          <TabsList>
            <TabsTrigger value="outstanding">
              <AlertTriangle className="h-4 w-4 mr-1.5" /> ค้างเคลียร์ ({outstanding.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1.5" /> ทั้งหมด ({history.length})
            </TabsTrigger>
            <TabsTrigger value="people">
              <Users className="h-4 w-4 mr-1.5" /> สรุปต่อคน ({perPerson.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding">
            <AdvanceTable
              rows={outstanding}
              isLoading={isLoading}
              onClear={(a) => setClearTarget(a)}
              onHistory={(a) => setHistoryTarget(a)}
              onDelete={(a) => {
                if (confirm(`ลบทดรอง ${fmt(Number(a.amount))} ฿ ของ ${a.recipient_name}?`))
                  deleteAdvance.mutate(a.id);
              }}
              onWriteOff={(a) => {
                const reason = prompt("เหตุผลที่ตัดเป็นค่าใช้จ่ายไม่ต้องเรียกคืน:");
                if (reason !== null) writeOff.mutate({ id: a.id, notes: reason });
              }}
            />
          </TabsContent>

          <TabsContent value="history">
            <AdvanceTable
              rows={history}
              isLoading={isLoading}
              onClear={(a) => setClearTarget(a)}
              onHistory={(a) => setHistoryTarget(a)}
              onDelete={(a) => {
                if (confirm(`ลบรายการนี้?`)) deleteAdvance.mutate(a.id);
              }}
              onWriteOff={(a) => {
                const reason = prompt("เหตุผลที่ตัดเป็นค่าใช้จ่าย:");
                if (reason !== null) writeOff.mutate({ id: a.id, notes: reason });
              }}
            />
          </TabsContent>

          <TabsContent value="people">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้รับ</TableHead>
                    <TableHead className="text-right">ยอดทั้งหมด</TableHead>
                    <TableHead className="text-right">ค้างเคลียร์</TableHead>
                    <TableHead className="text-right">รายการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perPerson.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        ยังไม่มีข้อมูล
                      </TableCell>
                    </TableRow>
                  )}
                  {perPerson.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{fmt(p.total)} ฿</TableCell>
                      <TableCell
                        className={`text-right font-bold ${
                          p.outstanding > 0 ? "text-amber-400" : "text-muted-foreground"
                        }`}
                      >
                        {fmt(p.outstanding)} ฿
                      </TableCell>
                      <TableCell className="text-right">{p.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AddAdvanceDialog open={showAdd} onOpenChange={setShowAdd} />
      <ClearAdvanceDialog
        advance={clearTarget}
        onClose={() => setClearTarget(null)}
      />
      <ClearancesDialog
        advance={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
};

function AdvanceTable({
  rows,
  isLoading,
  onClear,
  onHistory,
  onDelete,
  onWriteOff,
}: {
  rows: CashAdvance[];
  isLoading: boolean;
  onClear: (a: CashAdvance) => void;
  onHistory: (a: CashAdvance) => void;
  onDelete: (a: CashAdvance) => void;
  onWriteOff: (a: CashAdvance) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>ผู้รับ</TableHead>
            <TableHead>วัตถุประสงค์</TableHead>
            <TableHead className="text-right">ยอด</TableHead>
            <TableHead className="text-right">เคลียร์แล้ว</TableHead>
            <TableHead className="text-right">คงเหลือ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                กำลังโหลด...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                ไม่มีรายการ
              </TableCell>
            </TableRow>
          )}
          {rows.map((a) => {
            const remain = Math.max(0, Number(a.amount) - Number(a.cleared_amount));
            return (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(a.advance_date).toLocaleDateString("th-TH")}
                </TableCell>
                <TableCell className="font-medium">{a.recipient_name}</TableCell>
                <TableCell className="max-w-[280px] truncate text-muted-foreground">
                  {a.purpose || a.event_name || "—"}
                </TableCell>
                <TableCell className="text-right">{fmt(Number(a.amount))}</TableCell>
                <TableCell className="text-right">{fmt(Number(a.cleared_amount))}</TableCell>
                <TableCell
                  className={`text-right font-bold ${
                    remain > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {fmt(remain)}
                </TableCell>
                <TableCell>{statusBadge(a.status)}</TableCell>
                <TableCell className="text-right space-x-1">
                  {a.status !== "cleared" && a.status !== "written_off" && (
                    <Button size="sm" variant="default" onClick={() => onClear(a)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> เคลียร์
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onHistory(a)}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  {a.status !== "cleared" && a.status !== "written_off" && (
                    <Button size="sm" variant="ghost" onClick={() => onWriteOff(a)} title="ตัดเป็นค่าใช้จ่าย">
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onDelete(a)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

export default CashAdvancePage;
