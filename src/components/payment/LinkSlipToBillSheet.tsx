import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatBaht } from "@/lib/amount-model";
import { getReceiptFileUrl } from "@/lib/receipt-file";
import { Link2, Eye, Loader2 } from "lucide-react";

interface Props {
  bill: any | null;
  onOpenChange: (open: boolean) => void;
}

const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function formatThaiDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * ผูกสลิปที่ส่งเข้าไลน์ไว้แล้ว เข้ากับบิลคู่ค้าที่รอจ่าย
 * - สลิปมักเป็นยอดโอนจริง (net หลังหัก ณ ที่จ่าย) ไม่ตรงยอดบิลเต็ม → เทียบทั้ง net และ gross
 * - เลือกด้วยมือเท่านั้น ไม่จับคู่อัตโนมัติ
 * - ผูกแล้ว: บิล=paid, ใช้ไฟล์สลิปเดิมเป็นหลักฐาน, ผูก matched_expense_id, ปิดทั้งชุด voucher
 */
export default function LinkSlipToBillSheet({ bill, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  const net = Number(bill?.net_amount ?? 0) || (Number(bill?.amount || 0) + Number(bill?.vat_amount || 0) - Number(bill?.wht_amount || 0));
  const gross = Number(bill?.amount || 0) + Number(bill?.vat_amount || 0);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["linkable-slips", bill?.id],
    enabled: !!bill,
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];
      const { data: expenses, error } = await supabase
        .from("expenses")
        .select("id, amount, wht_amount, expense_date, expense_time, receiver, description, receipt_url, transaction_id, created_at")
        .not("receipt_url", "is", null)
        .gte("expense_date", since)
        .order("expense_date", { ascending: false })
        .limit(300);
      if (error) throw error;

      // ตัดรายการที่ถูกผูกกับบิล/ใบทีมงานอื่นไปแล้วออก
      const ids = (expenses || []).map((e: any) => e.id);
      const linked = new Set<string>();
      if (ids.length) {
        const [{ data: vb }, { data: si }] = await Promise.all([
          supabase.from("vendor_invoices").select("matched_expense_id").in("matched_expense_id", ids),
          supabase.from("staff_invoices").select("matched_expense_id").in("matched_expense_id", ids),
        ]);
        (vb || []).forEach((r: any) => r.matched_expense_id && linked.add(r.matched_expense_id));
        (si || []).forEach((r: any) => r.matched_expense_id && linked.add(r.matched_expense_id));
      }
      return (expenses || []).filter((e: any) => !linked.has(e.id));
    },
  });

  const scored = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .map((e: any) => {
        const amt = Number(e.amount) || 0;
        const eNet = amt - (Number(e.wht_amount) || 0);
        let score = 0;
        let matchLabel = "";
        if (net > 0 && Math.abs(amt - net) <= 2) { score = 3; matchLabel = "ตรงยอดโอน"; }
        else if (gross > 0 && Math.abs(amt - gross) <= 2) { score = 2; matchLabel = "ตรงยอดบิล"; }
        else if (net > 0 && Math.abs(eNet - net) <= 2) { score = 1; matchLabel = "ใกล้ยอดโอน"; }
        return { ...e, score, matchLabel };
      })
      .filter((e: any) => {
        if (!q) return true;
        return (
          String(e.amount).includes(q) ||
          (e.receiver || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q) ||
          formatThaiDate(e.expense_date).includes(q)
        );
      })
      .sort((a: any, b: any) => b.score - a.score || String(b.expense_date).localeCompare(String(a.expense_date)));
  }, [candidates, search, net, gross]);

  const link = async (expense: any) => {
    if (!bill) return;
    setLinking(expense.id);
    try {
      const paidAt = new Date().toISOString();
      const slipDate = expense.expense_date || paidAt.split("T")[0];

      let bills: any[] = [bill];
      if (bill.voucher_id) {
        const { data: groupBills } = await supabase
          .from("vendor_invoices")
          .select("id")
          .eq("voucher_id", bill.voucher_id)
          .neq("status", "paid");
        if (groupBills?.length) bills = groupBills;
      }

      const { error } = await supabase
        .from("vendor_invoices")
        .update({
          status: "paid",
          paid_at: paidAt,
          payment_slip_url: expense.receipt_url,
          matched_expense_id: expense.id,
        } as any)
        .in("id", bills.map((b: any) => b.id));
      if (error) throw error;

      if (bill.voucher_id) {
        await supabase
          .from("staff_invoices")
          .update({ status: "paid", paid_at: paidAt, payment_slip_url: expense.receipt_url } as any)
          .eq("voucher_id", bill.voucher_id)
          .neq("status", "paid");
        await supabase
          .from("payment_vouchers")
          .update({ status: "paid", paid_date: slipDate, payment_slip_url: expense.receipt_url, matched_expense_id: expense.id } as any)
          .eq("id", bill.voucher_id);
      }

      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: `✅ ผูกสลิปและบันทึกจ่ายแล้ว (${bills.length} รายการ)` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "ผูกสลิปไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Sheet open={!!bill} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />ผูกสลิปจากไลน์ {bill?.receipt_no ? `· ${bill.receipt_no}` : ""}
          </SheetTitle>
          <SheetDescription>
            {bill?.vendor_profiles?.company_name || bill?.submitted_via_line_display_name || "ยังไม่ผูกคู่ค้า"}
            {bill?.description ? ` · ${bill.description}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">ยอดบิล (รวม VAT)</span><span>{formatBaht(gross)}</span></div>
            {Number(bill?.wht_amount) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>หัก ณ ที่จ่าย {bill?.wht_rate}%</span><span>-{formatBaht(Number(bill?.wht_amount))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-primary border-t pt-1">
              <span>ยอดโอนจริง (ที่ควรเห็นในสลิป)</span><span>{formatBaht(net)} ฿</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            เลือกสลิปที่ส่งเข้าไลน์ไว้แล้ว — ระบบเรียงใบที่ยอดตรง "ยอดโอนจริง" ไว้บนสุด (สลิปมักเป็นยอดหลังหัก ณ ที่จ่าย ไม่ใช่ยอดบิลเต็ม)
          </p>

          <Input placeholder="ค้นหา ยอด / ชื่อผู้รับ / วันที่" value={search} onChange={(e) => setSearch(e.target.value)} />

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : scored.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">ไม่พบสลิปที่ยังไม่ได้ผูกในช่วง 60 วันล่าสุด</p>
          ) : (
            <div className="space-y-2">
              {scored.map((e: any) => (
                <div key={e.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{formatBaht(Number(e.amount))} ฿</p>
                      <p className="text-xs text-muted-foreground">
                        {formatThaiDate(e.expense_date)}{e.expense_time ? ` · ${String(e.expense_time).slice(0, 5)}` : ""}
                        {e.receiver ? ` · ${e.receiver}` : ""}
                      </p>
                      {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                    </div>
                    {e.matchLabel && (
                      <Badge variant={e.score >= 2 ? "default" : "secondary"} className="shrink-0 text-xs">{e.matchLabel}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={async () => {
                      const res = await getReceiptFileUrl(e.receipt_url);
                      if (res?.url) window.open(res.url, "_blank");
                      else toast({ title: "เปิดสลิปไม่สำเร็จ", variant: "destructive" });
                    }}>
                      <Eye className="h-4 w-4 mr-1" />ดูสลิป
                    </Button>
                    <Button size="sm" className="flex-1" disabled={!!linking} onClick={() => link(e)}>
                      {linking === e.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                      ผูกสลิปนี้ + บันทึกจ่าย
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
