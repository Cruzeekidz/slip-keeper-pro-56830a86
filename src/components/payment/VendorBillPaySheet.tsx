import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { INCOME_TYPES } from "@/lib/wht-constants";
import { deriveAmounts, formatBaht } from "@/lib/amount-model";
import { Copy, AlertTriangle, Save } from "lucide-react";

interface Props {
  bill: any | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * เช็กลิสต์ก่อนจ่ายบิลคู่ค้า:
 *   ยอดเต็ม (Gross) → ต้องหัก ณ ที่จ่ายไหม / อัตราเท่าไร → ยอดโอนจริง (Net)
 * เก็บ amount (gross), wht_rate, wht_amount, net_amount ลงบิล
 */
export default function VendorBillPaySheet({ bill, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gross, setGross] = useState("0");
  const [whtRate, setWhtRate] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bill) return;
    setGross(String(Number(bill.amount) || 0));
    setWhtRate(String(Number(bill.wht_rate) || 0));
  }, [bill]);

  const rates = useMemo(() => {
    const seen = new Map<number, string>();
    for (const t of INCOME_TYPES) {
      if (t.rate <= 0) continue;
      if (!seen.has(t.rate)) seen.set(t.rate, t.label);
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, []);

  const amounts = deriveAmounts({ input: Number(gross) || 0, mode: "gross", whtRate: Number(whtRate) || 0 });
  const vendorTaxId = (bill?.vendor_profiles?.tax_id || bill?.tax_id || "").replace(/\D/g, "");
  const taxIdOk = vendorTaxId.length === 13;

  const save = async (markApproved: boolean) => {
    if (!bill) return;
    setSaving(true);
    try {
      const updates: any = {
        amount: amounts.gross,
        wht_rate: Number(whtRate) || 0,
        wht_amount: amounts.wht,
        net_amount: amounts.net,
      };
      if (markApproved) updates.status = "approved";
      const { error } = await supabase.from("vendor_invoices").update(updates).eq("id", bill.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["payment-queue-vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-invoices"] });
      toast({ title: markApproved ? "✅ บันทึก + อนุมัติแล้ว" : "✅ บันทึกยอดแล้ว" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "บันทึกไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!bill} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>🧾 เตรียมจ่าย {bill?.receipt_no ? `· ${bill.receipt_no}` : ""}</SheetTitle>
          <SheetDescription>
            {bill?.vendor_profiles?.company_name || bill?.submitted_via_line_display_name || "ยังไม่ผูกคู่ค้า"}
            {bill?.description ? ` · ${bill.description}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>1) ยอดเต็มตามบิล (Gross)</Label>
            <Input type="number" value={gross} onChange={(e) => setGross(e.target.value)} />
          </div>

          <div>
            <Label>2) ต้องหัก ณ ที่จ่ายไหม</Label>
            <Select value={whtRate} onValueChange={setWhtRate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">ไม่หัก</SelectItem>
                {rates.map(([rate, label]) => (
                  <SelectItem key={rate} value={String(rate)}>{rate}% — {label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {Number(whtRate) > 0 && !taxIdOk && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>ยังไม่มีเลขผู้เสียภาษี 13 หลักของคู่ค้า — ออกหนังสือรับรองหัก ณ ที่จ่ายไม่ได้ ขอข้อมูลก่อนจ่ายเงิน</span>
            </div>
          )}

          <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span>{formatBaht(amounts.gross)}</span></div>
            {amounts.wht > 0 && (
              <div className="flex justify-between text-destructive">
                <span>หัก ณ ที่จ่าย {whtRate}%</span><span>-{formatBaht(amounts.wht)}</span>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">3) ยอดโอนจริง (Net)</p>
              <p className="text-3xl font-bold text-primary tracking-tight">{formatBaht(amounts.net)} ฿</p>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              navigator.clipboard.writeText(amounts.net.toFixed(2));
              toast({ title: "คัดลอกยอดโอน", description: `${formatBaht(amounts.net)} บาท` });
            }}>
              <Copy className="h-4 w-4 mr-1" />คัดลอกยอดโอน
            </Button>
          </div>

          {bill?.receipt_no && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              โอนแล้วให้ใส่ <span className="font-mono font-bold">@{bill.receipt_no}</span> ในช่องบันทึกช่วยจำของสลิป
              แล้วส่งสลิปเข้าไลน์ ระบบจะตัดจ่ายบิลใบนี้ให้เอง
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={() => save(true)} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />{saving ? "กำลังบันทึก..." : "บันทึก + อนุมัติ (พร้อมจ่าย)"}
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>บันทึกยอดไว้ก่อน</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
