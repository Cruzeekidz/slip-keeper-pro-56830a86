import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { INCOME_TYPES } from "@/lib/wht-constants";
import { deriveWithVat, formatBaht } from "@/lib/amount-model";
import { Copy, AlertTriangle, Save } from "lucide-react";

interface Props {
  bill: any | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * เช็กลิสต์ก่อนจ่ายบิลคู่ค้า:
 *   ยอดบิล (รวม/ไม่รวม VAT) → แยก VAT → หัก ณ ที่จ่ายจากยอดก่อน VAT → ยอดโอนจริง (Net)
 * เก็บ amount (ก่อน VAT), vat_amount, wht_rate, wht_amount, net_amount ลงบิล
 */
export default function VendorBillPaySheet({ bill, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("0");
  const [vatIncluded, setVatIncluded] = useState("excluded"); // ยอดที่กรอกรวม VAT แล้วหรือไม่
  const [vatRate, setVatRate] = useState("0");
  const [whtRate, setWhtRate] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bill) return;
    const vat = Number(bill.vat_amount) || 0;
    const base = Number(bill.amount) || 0;
    setVatRate(vat > 0 && base > 0 ? "7" : "0");
    setVatIncluded("excluded");
    setInput(String(base));
    setWhtRate(String(Number(bill.wht_rate) || 0));
  }, [bill]);

  const { individualRates, juristicRates } = useMemo(() => {
    const pick = (kind: "individual" | "juristic") => {
      const seen = new Map<string, { rate: number; label: string }>();
      for (const t of INCOME_TYPES) {
        if (t.rate <= 0) continue;
        if (t.payeeKind !== kind && t.payeeKind !== "both") continue;
        const key = `${t.rate}-${t.label}`;
        if (!seen.has(key)) seen.set(key, { rate: t.rate, label: t.label.replace(/ - นิติบุคคล/g, "") });
      }
      return [...seen.values()].sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label, "th"));
    };
    return { individualRates: pick("individual"), juristicRates: pick("juristic") };
  }, []);

  const amounts = deriveWithVat({
    input: Number(input) || 0,
    vatRate: Number(vatRate) || 0,
    vatIncluded: vatIncluded === "included",
    whtRate: Number(whtRate) || 0,
  });

  const vendorTaxId = (bill?.vendor_profiles?.tax_id || bill?.tax_id || "").replace(/\D/g, "");
  const taxIdOk = vendorTaxId.length === 13;

  const save = async (markApproved: boolean) => {
    if (!bill) return;
    setSaving(true);
    try {
      const updates: any = {
        amount: amounts.base,
        vat_amount: amounts.vat,
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
          {/* บัญชีรับโอน */}
          {(() => {
            const acct = (bill?.vendor_profiles?.bank_account || "").replace(/[^0-9]/g, "");
            const bankName = bill?.vendor_profiles?.bank_name || "";
            const accName = bill?.vendor_profiles?.company_name || bill?.submitted_via_line_display_name || "";
            if (!acct) {
              return (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>ยังไม่มีเลขบัญชีของคู่ค้ารายนี้ — เพิ่มเลขบัญชีในหน้าจัดการคู่ค้าก่อนโอนเงิน</span>
                </div>
              );
            }
            return (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">บัญชีรับโอน</p>
                <p className="text-2xl font-bold font-mono tracking-wider break-all">{acct}</p>
                <p className="text-xs text-muted-foreground">{bankName}{accName ? ` — ${accName}` : ""}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => {
                    navigator.clipboard.writeText(acct);
                    toast({ title: "คัดลอกเลขบัญชี", description: `${acct}${bankName ? ` · ${bankName}` : ""}` });
                  }}>
                    <Copy className="h-4 w-4 mr-1" />คัดลอกเลขบัญชี
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(`${bankName}\n${acct}\n${accName}`);
                    toast({ title: "คัดลอกข้อมูลบัญชีทั้งชุด" });
                  }}>
                    คัดลอกทั้งชุด
                  </Button>
                </div>
              </div>
            );
          })()}

          <div>
            <Label>1) ยอดตามบิล</Label>
            <Input type="number" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>ยอดที่กรอกนี้</Label>
              <Select value={vatIncluded} onValueChange={setVatIncluded}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excluded">ยังไม่รวม VAT</SelectItem>
                  <SelectItem value="included">รวม VAT แล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>2) VAT</Label>
              <Select value={vatRate} onValueChange={setVatRate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่มี VAT</SelectItem>
                  <SelectItem value="7">VAT 7%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>3) ต้องหัก ณ ที่จ่ายไหม</Label>
            <Select value={whtRate} onValueChange={setWhtRate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">ไม่หัก</SelectItem>
                <SelectGroup>
                  <SelectLabel>บุคคลธรรมดา (ภ.ง.ด.3)</SelectLabel>
                  {individualRates.map((r) => (
                    <SelectItem key={`p-${r.label}-${r.rate}`} value={String(r.rate)}>{r.rate}% — {r.label}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>นิติบุคคล (ภ.ง.ด.53)</SelectLabel>
                  {juristicRates.map((r) => (
                    <SelectItem key={`c-${r.label}-${r.rate}`} value={String(r.rate)}>{r.rate}% — {r.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              หัก ณ ที่จ่ายคิดจากยอดก่อน VAT เสมอ ({formatBaht(amounts.base)} ฿)
            </p>
          </div>

          {Number(whtRate) > 0 && !taxIdOk && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>ยังไม่มีเลขผู้เสียภาษี 13 หลักของคู่ค้า — ออกหนังสือรับรองหัก ณ ที่จ่ายไม่ได้ ขอข้อมูลก่อนจ่ายเงิน</span>
            </div>
          )}

          <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">ยอดก่อน VAT</span><span>{formatBaht(amounts.base)}</span></div>
            {amounts.vat > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">VAT {vatRate}%</span><span>{formatBaht(amounts.vat)}</span></div>
            )}
            <div className="flex justify-between font-medium"><span>ยอดรวม</span><span>{formatBaht(amounts.gross)}</span></div>
            {amounts.wht > 0 && (
              <div className="flex justify-between text-destructive">
                <span>หัก ณ ที่จ่าย {whtRate}% (จากยอดก่อน VAT)</span><span>-{formatBaht(amounts.wht)}</span>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">4) ยอดโอนจริง (Net)</p>
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
              แล้วส่งสลิปเข้าไลน์ ระบบจะตัดจ่ายบิลใบนี้ให้เอง หรือกด "จ่ายแล้ว + แนบสลิป" ในหน้ารอจ่ายก็ได้
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
