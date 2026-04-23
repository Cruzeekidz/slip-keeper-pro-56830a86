import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
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
  invoice: (InvoiceForMatching & { status?: string }) | null;
  onClose: () => void;
  /** ถ้า true: auto-link เลยถ้าเจอ match เดียว, แสดง dialog ถ้ามีหลาย */
  autoLinkSingle?: boolean;
}

const LinkExpenseDialog = ({ invoice, onClose, autoLinkSingle = false }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ExpenseCandidate[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!invoice || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSearched(false);
      try {
        const results = await findMatchingExpenses(invoice, user.id);
        if (cancelled) return;
        setCandidates(results);
        setSearched(true);

        // Auto-link if exactly one match and autoLinkSingle is on
        if (autoLinkSingle && results.length === 1) {
          await handleLink(results[0].id, true);
        }
      } catch (e: any) {
        if (!cancelled) toast({ title: "ค้นหาไม่สำเร็จ", description: e.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  const handleLink = async (expenseId: string, isAuto = false) => {
    if (!invoice || !user) return;
    setLinking(expenseId);
    try {
      await linkInvoiceToExpense({
        invoiceId: invoice.id,
        expenseId,
        userId: user.id,
        userEmail: user.email,
        invoiceNumber: invoice.invoice_number,
        oldStatus: (invoice as any).status,
      });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      toast({
        title: isAuto ? "เชื่อมรายการอัตโนมัติสำเร็จ" : "เชื่อมรายการสำเร็จ",
        description: `${invoice.invoice_number} → expense ${expenseId.slice(0, 8)}`,
      });
      onClose();
    } catch (e: any) {
      toast({ title: "เชื่อมไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            เชื่อมกับรายการที่จ่ายแล้ว
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-3">
            <Card className="p-3 bg-muted/50">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">เลขที่:</span>
                  <span className="font-mono">{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ทีมงาน:</span>
                  <span className="font-medium">{invoice.staff_profiles?.staff_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ยอดสุทธิ:</span>
                  <span className="font-bold text-primary">
                    {Number(invoice.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                  </span>
                </div>
              </div>
            </Card>

            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                กำลังค้นหา...
              </div>
            )}

            {!loading && searched && candidates.length === 0 && (
              <Card className="p-6 text-center border-dashed">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium">ไม่พบรายการที่ตรงกัน</p>
                <p className="text-xs text-muted-foreground mt-1">
                  เกณฑ์ค้นหา: ยอดสุทธิ {Number(invoice.net_amount).toLocaleString()} บาท + มีชื่อทีมงานในผู้รับ + ช่วง ±7 วัน
                </p>
              </Card>
            )}

            {!loading && candidates.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  พบ {candidates.length} รายการที่อาจตรงกัน — เลือก 1 รายการเพื่อเชื่อม
                </p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {candidates.map((c) => (
                    <Card key={c.id} className="p-3 hover:border-primary transition-colors">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{c.receiver || c.staff_name || "(ไม่มีชื่อผู้รับ)"}</span>
                            <Badge variant="secondary" className="text-[10px]">{c.match_reason}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.expense_date} • {c.category} • {Number(c.amount).toLocaleString()} บาท
                          </div>
                          {c.description && (
                            <div className="text-xs text-muted-foreground truncate">{c.description}</div>
                          )}
                          {c.receipt_url && (
                            <Badge variant="outline" className="text-[10px]">มีสลิป</Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleLink(c.id)}
                          disabled={!!linking}
                        >
                          {linking === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <><CheckCircle className="h-3 w-3 mr-1" />เชื่อม</>
                          )}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LinkExpenseDialog;
