import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, FileText } from "lucide-react";
import { useCashAdvanceClearances, useDeleteClearance, type CashAdvance } from "@/hooks/useCashAdvances";
import { Badge } from "@/components/ui/badge";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(n);

export function ClearancesDialog({
  advance,
  onClose,
}: {
  advance: CashAdvance | null;
  onClose: () => void;
}) {
  const { data: clearances = [], isLoading } = useCashAdvanceClearances(advance?.id ?? null);
  const del = useDeleteClearance();

  if (!advance) return null;

  return (
    <Dialog open={!!advance} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ประวัติการเคลียร์ — {advance.recipient_name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div>
            ยอดทดรอง: <span className="font-medium">{fmt(Number(advance.amount))} ฿</span>
            <span className="ml-3 text-muted-foreground">วันที่:</span>{" "}
            {new Date(advance.advance_date).toLocaleDateString("th-TH")}
          </div>
          {advance.purpose && (
            <div className="text-muted-foreground">วัตถุประสงค์: {advance.purpose}</div>
          )}
          {advance.notes && <div className="text-muted-foreground">หมายเหตุ: {advance.notes}</div>}
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {isLoading && <p className="text-center text-muted-foreground">กำลังโหลด...</p>}
          {!isLoading && clearances.length === 0 && (
            <p className="text-center text-muted-foreground py-6">ยังไม่มีการเคลียร์</p>
          )}
          {clearances.map((c) => (
            <div key={c.id} className="rounded-md border p-3 flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{fmt(Number(c.amount))} ฿</span>
                  {Number(c.refund_amount) > 0 && (
                    <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                      คืน {fmt(Number(c.refund_amount))} ฿
                    </Badge>
                  )}
                  {!c.has_formal_receipt && (
                    <Badge variant="secondary">ไม่มีบิลทางการ</Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(c.clear_date).toLocaleDateString("th-TH")}
                  </span>
                </div>
                {c.description && <p className="text-sm">{c.description}</p>}
                {c.notes && (
                  <p className="text-xs text-muted-foreground">{c.notes}</p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm("ลบรายการเคลียร์นี้?"))
                    del.mutate({ id: c.id, advance_id: advance.id });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
