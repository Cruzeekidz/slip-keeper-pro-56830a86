import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  findMatchingExpenses,
  linkInvoiceToExpense,
  type ExpenseCandidate,
  type InvoiceForMatching,
} from "@/hooks/useInvoiceMatching";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Invoices that are 'approved' and have no matched_expense_id */
  invoices: (InvoiceForMatching & { status?: string; matched_expense_id?: string | null })[];
}

interface ScanResult {
  invoice: InvoiceForMatching;
  candidates: ExpenseCandidate[];
  selectedExpenseId: string | null;
  status: "pending" | "linked" | "skipped" | "error";
  errorMsg?: string;
}

const BulkReconcileDialog = ({ open, onClose, invoices }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanned, setScanned] = useState(false);

  const eligible = invoices.filter((i) => !i.matched_expense_id && i.status !== "paid");

  const handleScan = async () => {
    if (!user) return;
    setScanning(true);
    setScanned(false);
    try {
      const out: ScanResult[] = [];
      for (const inv of eligible) {
        const cands = await findMatchingExpenses(inv, user.id);
        out.push({
          invoice: inv,
          candidates: cands,
          selectedExpenseId: cands.length === 1 ? cands[0].id : null,
          status: "pending",
        });
      }
      setResults(out);
      setScanned(true);
      const single = out.filter((r) => r.candidates.length === 1).length;
      const multi = out.filter((r) => r.candidates.length > 1).length;
      const none = out.filter((r) => r.candidates.length === 0).length;
      toast({
        title: "สแกนเสร็จสิ้น",
        description: `พบ match เดียว ${single} • หลาย match ${multi} • ไม่พบ ${none}`,
      });
    } catch (e: any) {
      toast({ title: "สแกนไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleApply = async () => {
    if (!user) return;
    const toLink = results.filter((r) => r.selectedExpenseId && r.status === "pending");
    if (toLink.length === 0) {
      toast({ title: "ไม่มีรายการที่เลือก" });
      return;
    }
    setApplying(true);
    let success = 0;
    let fail = 0;
    const updated = [...results];
    for (const r of toLink) {
      const idx = updated.findIndex((u) => u.invoice.id === r.invoice.id);
      try {
        await linkInvoiceToExpense({
          invoiceId: r.invoice.id,
          expenseId: r.selectedExpenseId!,
          userId: user.id,
          userEmail: user.email,
          invoiceNumber: r.invoice.invoice_number,
          oldStatus: (r.invoice as any).status,
        });
        updated[idx] = { ...updated[idx], status: "linked" };
        success++;
      } catch (e: any) {
        updated[idx] = { ...updated[idx], status: "error", errorMsg: e.message };
        fail++;
      }
      setResults([...updated]);
    }
    setApplying(false);
    queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
    toast({
      title: "เชื่อมรายการเสร็จสิ้น",
      description: `สำเร็จ ${success} • ล้มเหลว ${fail}`,
      variant: fail > 0 ? "destructive" : "default",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setResults([]); setScanned(false); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            ค้นหาและเชื่อมรายการอัตโนมัติ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="p-3 bg-muted/50 text-sm">
            <p>
              จะสแกน <strong>{eligible.length}</strong> รายการที่ยังไม่ถูกเชื่อม (สถานะ: ส่งแล้ว/อนุมัติแล้ว)
              เพื่อหา expense ที่ตรงกัน — เกณฑ์: <em>ยอดสุทธิตรงเป๊ะ + มีชื่อทีมงานในผู้รับ + ช่วง ±3 วัน</em>
            </p>
          </Card>

          {!scanned && (
            <Button onClick={handleScan} disabled={scanning || eligible.length === 0} className="w-full">
              {scanning ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังสแกน...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />เริ่มสแกน</>
              )}
            </Button>
          )}

          {scanned && (
            <>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {results.map((r) => (
                  <Card key={r.invoice.id} className="p-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{r.invoice.invoice_number}</span>
                          <span className="font-medium text-sm">{r.invoice.staff_profiles?.staff_name}</span>
                          <span className="text-sm text-primary font-bold">
                            {Number(r.invoice.net_amount).toLocaleString()} บาท
                          </span>
                        </div>
                      </div>
                      {r.status === "linked" && <Badge className="bg-primary"><CheckCircle2 className="h-3 w-3 mr-1" />เชื่อมแล้ว</Badge>}
                      {r.status === "error" && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />ล้มเหลว</Badge>}
                    </div>

                    {r.candidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">ไม่พบรายการที่ตรงกัน</p>
                    ) : (
                      <div className="space-y-1">
                        {r.candidates.map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 p-2 rounded border hover:bg-accent/50 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={r.selectedExpenseId === c.id}
                              disabled={r.status !== "pending"}
                              onCheckedChange={(checked) => {
                                setResults((prev) =>
                                  prev.map((p) =>
                                    p.invoice.id === r.invoice.id
                                      ? { ...p, selectedExpenseId: checked ? c.id : null }
                                      : p
                                  )
                                );
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{c.receiver || c.staff_name || "-"}</span>
                                <Badge variant="secondary" className="text-[10px]">{c.match_reason}</Badge>
                              </div>
                              <div className="text-muted-foreground">
                                {c.expense_date} • {Number(c.amount).toLocaleString()} บาท
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {r.errorMsg && <p className="text-xs text-destructive mt-1">{r.errorMsg}</p>}
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleScan} disabled={scanning || applying}>
                  สแกนอีกครั้ง
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applying || results.every((r) => !r.selectedExpenseId || r.status !== "pending")}
                  className="flex-1"
                >
                  {applying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังเชื่อม...</>
                  ) : (
                    <><Link2 className="h-4 w-4 mr-2" />เชื่อมรายการที่เลือก ({results.filter((r) => r.selectedExpenseId && r.status === "pending").length})</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkReconcileDialog;
