import { formatBaht } from "@/lib/amount-model";

interface Props {
  gross: number;
  wht?: number | null;
  whtRate?: number | null;
  className?: string;
}

/** แสดงยอดเป็นชุด 3 บรรทัดมาตรฐาน: ยอดค่าใช้จ่าย / หัก ณ ที่จ่าย / ยอดโอนจริง */
export function AmountBreakdown({ gross, wht, whtRate, className }: Props) {
  const whtAmount = Number(wht) || 0;
  const net = (Number(gross) || 0) - whtAmount;
  return (
    <div className={`text-xs space-y-0.5 ${className ?? ""}`}>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">ยอดค่าใช้จ่าย (ลงบัญชี)</span>
        <span className="font-medium tabular-nums">{formatBaht(gross)}</span>
      </div>
      {whtAmount > 0 && (
        <>
          <div className="flex justify-between gap-4 text-warning">
            <span>หัก ณ ที่จ่าย{whtRate ? ` ${whtRate}%` : ""}</span>
            <span className="tabular-nums">-{formatBaht(whtAmount)}</span>
          </div>
          <div className="flex justify-between gap-4 border-t pt-0.5">
            <span className="text-muted-foreground">ยอดโอนจริง (ตามสลิป)</span>
            <span className="font-semibold tabular-nums">{formatBaht(net)}</span>
          </div>
        </>
      )}
    </div>
  );
}