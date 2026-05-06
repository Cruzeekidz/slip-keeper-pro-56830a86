import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Receipt, Percent } from "lucide-react";

export interface TaxFieldsValue {
  amount: string;             // user-entered amount
  inputMode: "gross" | "net"; // gross = incl VAT before WHT; net = paid amount
  hasVat: boolean;
  vatRate: number;            // %
  hasWht: boolean;
  whtRate: number;            // %
}

export interface TaxBreakdown {
  base: number;       // pre-VAT
  vat: number;
  gross: number;      // base + vat
  wht: number;        // base * whtRate
  net: number;        // gross - wht
}

export function computeTax(v: TaxFieldsValue): TaxBreakdown {
  const entered = parseFloat(v.amount) || 0;
  const vatR = v.hasVat ? v.vatRate / 100 : 0;
  const whtR = v.hasWht ? v.whtRate / 100 : 0;

  let base = 0;
  if (v.inputMode === "gross") {
    // entered = base * (1 + vatR)
    base = entered / (1 + vatR);
  } else {
    // entered = net = base*(1+vatR) - base*whtR = base*(1+vatR-whtR)
    const div = 1 + vatR - whtR;
    base = div > 0 ? entered / div : entered;
  }
  const vat = round2(base * vatR);
  const wht = round2(base * whtR);
  const baseR = round2(base);
  const gross = round2(baseR + vat);
  const net = round2(gross - wht);
  return { base: baseR, vat, gross, wht, net };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface Props {
  value: TaxFieldsValue;
  onChange: (v: TaxFieldsValue) => void;
}

export default function TaxFieldsSection({ value, onChange }: Props) {
  const b = useMemo(() => computeTax(value), [value]);
  const update = (patch: Partial<TaxFieldsValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
      {/* Mode toggle */}
      <div>
        <Label className="text-sm">ยอดที่กรอกคืออะไร?</Label>
        <RadioGroup
          value={value.inputMode}
          onValueChange={(m) => update({ inputMode: m as "gross" | "net" })}
          className="grid grid-cols-2 gap-2 mt-1"
        >
          <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent text-sm">
            <RadioGroupItem value="gross" />
            <div>
              <div className="font-medium">ยอดในบิล/ใบกำกับ</div>
              <div className="text-xs text-muted-foreground">รวม VAT ก่อนหัก WHT</div>
            </div>
          </label>
          <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent text-sm">
            <RadioGroupItem value="net" />
            <div>
              <div className="font-medium">ยอดที่จ่ายจริง</div>
              <div className="text-xs text-muted-foreground">ตรงกับยอดในสลิปโอน</div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Amount */}
      <div>
        <Label htmlFor="tax-amount">
          {value.inputMode === "gross" ? "ยอดเต็ม (รวม VAT)" : "ยอดที่จ่าย (Net)"} *
        </Label>
        <Input
          id="tax-amount"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={value.amount}
          onChange={(e) => update({ amount: e.target.value })}
          placeholder="0.00"
          required
        />
      </div>

      {/* VAT toggle */}
      <div className="flex items-center justify-between rounded-md border p-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <div>
            <Label className="font-medium text-sm">มี VAT (ใบกำกับภาษี)</Label>
            {value.hasVat && (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="number"
                  step="0.1"
                  className="h-7 w-16 text-sm"
                  value={value.vatRate}
                  onChange={(e) => update({ vatRate: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>
        </div>
        <Switch checked={value.hasVat} onCheckedChange={(c) => update({ hasVat: c, vatRate: c ? value.vatRate || 7 : 0 })} />
      </div>

      {/* WHT toggle */}
      <div className="flex items-center justify-between rounded-md border p-2">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" />
          <div>
            <Label className="font-medium text-sm">หัก ณ ที่จ่าย (WHT)</Label>
            {value.hasWht && (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="number"
                  step="0.1"
                  className="h-7 w-16 text-sm"
                  value={value.whtRate}
                  onChange={(e) => update({ whtRate: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-xs text-muted-foreground">% (เช่น 1, 2, 3, 5)</span>
              </div>
            )}
          </div>
        </div>
        <Switch checked={value.hasWht} onCheckedChange={(c) => update({ hasWht: c, whtRate: c ? value.whtRate || 3 : 0 })} />
      </div>

      {/* Breakdown */}
      {(value.hasVat || value.hasWht) && parseFloat(value.amount) > 0 && (
        <div className="rounded-md bg-background p-2 text-sm space-y-1 border">
          <Row label="ฐาน (ก่อน VAT)" v={b.base} />
          {value.hasVat && <Row label={`VAT ${value.vatRate}%`} v={b.vat} />}
          <Row label="ยอดเต็ม (Gross)" v={b.gross} bold />
          {value.hasWht && <Row label={`หัก ณ ที่จ่าย ${value.whtRate}%`} v={-b.wht} className="text-destructive" />}
          <Row label="จ่ายจริง (Net)" v={b.net} bold className="text-primary" />
        </div>
      )}
    </div>
  );
}

function Row({ label, v, bold, className }: { label: string; v: number; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${className || ""}`}>
      <span>{label}</span>
      <span>{v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}