import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Unlock, Pencil, Trash2, CreditCard, FileText } from "lucide-react";

interface Props {
  invoice: { id: string; invoice_number?: string | null } | null;
  onClose: () => void;
}

const ACTION_META: Record<string, { label: string; color: string; icon: any }> = {
  reopen: { label: "ย้อนกลับ", color: "bg-warning/20 text-warning border-warning/40", icon: Unlock },
  edit: { label: "แก้ไข", color: "bg-primary/20 text-primary border-primary/40", icon: Pencil },
  delete: { label: "ลบ", color: "bg-destructive/20 text-destructive border-destructive/40", icon: Trash2 },
  repay: { label: "จ่ายซ้ำ", color: "bg-success/20 text-success border-success/40", icon: CreditCard },
  create: { label: "สร้าง", color: "bg-secondary text-secondary-foreground", icon: FileText },
};

function formatDateTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString("th-TH", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function diffSummary(oldData: any, newData: any): string[] {
  if (!oldData || !newData) return [];
  const keys = ["gross_amount", "wht_amount", "net_amount", "days_worked", "daily_rate", "bonus_amount", "event_name"];
  const labels: Record<string, string> = {
    gross_amount: "Gross", wht_amount: "WHT", net_amount: "Net",
    days_worked: "วัน", daily_rate: "เรท/วัน", bonus_amount: "โบนัส", event_name: "งาน",
  };
  const out: string[] = [];
  for (const k of keys) {
    const o = oldData[k], n = newData[k];
    if (o == null && n == null) continue;
    if (String(o ?? "") !== String(n ?? "")) {
      out.push(`${labels[k]}: ${o ?? "-"} → ${n ?? "-"}`);
    }
  }
  return out;
}

export default function InvoiceAuditHistoryDialog({ invoice, onClose }: Props) {
  const open = !!invoice;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["invoice-audit-log", invoice?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoice_audit_log")
        .select("*")
        .eq("invoice_id", invoice!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            ประวัติการแก้ไข
          </DialogTitle>
          <DialogDescription>
            ใบ <span className="font-mono">{invoice?.invoice_number}</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">กำลังโหลด...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีประวัติการแก้ไข</p>
          ) : (
            <ol className="space-y-3">
              {logs.map((log: any) => {
                const meta = ACTION_META[log.action] || { label: log.action, color: "bg-muted text-muted-foreground", icon: FileText };
                const Icon = meta.icon;
                const diffs = diffSummary(log.old_data, log.new_data);
                return (
                  <li key={log.id} className="border rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${meta.color}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        {log.old_status && log.new_status && log.old_status !== log.new_status && (
                          <span className="text-xs text-muted-foreground">
                            {log.old_status} → {log.new_status}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                    </div>
                    {log.changed_by_email && (
                      <p className="text-xs text-muted-foreground">โดย: {log.changed_by_email}</p>
                    )}
                    {log.reason && (
                      <p className="text-sm">เหตุผล: <span className="font-medium">{log.reason}</span></p>
                    )}
                    {diffs.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
                        {diffs.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}