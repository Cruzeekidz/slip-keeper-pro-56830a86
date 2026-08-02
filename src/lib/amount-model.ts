/**
 * ศูนย์กลางสูตรยอดเงิน — กฎเดียวที่ต้องจำ:
 *   amount (ในฐานข้อมูล) = Gross เสมอ (ยอดค่าใช้จ่ายที่ลงบัญชี / P&L)
 *   ยอดโอนจริง (Net, ยอดบนสลิป) = Gross - WHT  ← คำนวณ ไม่เก็บซ้ำ
 */

export type AmountInputMode = "gross" | "net" | "none";

export interface AmountBreakdown {
  gross: number;
  vat: number;
  wht: number;
  net: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** ยอดสลิป (สุทธิ) → ยอดเต็ม เช่น 9,700 ที่หัก 3% => 10,000 */
export function grossFromNet(netAmount: number, whtRate: number): number {
  const rate = Number(whtRate) || 0;
  const net = Number(netAmount) || 0;
  if (rate <= 0 || rate >= 100) return round2(net);
  return round2(net / (1 - rate / 100));
}

/** ใช้ชื่อเดิมตามแผน: อ่านยอดจากสลิปแล้วแปลงกลับเป็น Gross */
export const grossFromSlip = grossFromNet;

/** แปลงยอดที่ผู้ใช้กรอก (เต็ม/สุทธิ) ให้เป็นชุด Gross / WHT / Net */
export function deriveAmounts(params: {
  input: number;
  mode?: AmountInputMode;
  whtRate?: number;
  vatRate?: number;
}): AmountBreakdown {
  const input = Number(params.input) || 0;
  const mode = params.mode ?? "gross";
  const whtRate = Number(params.whtRate) || 0;
  const vatRate = Number(params.vatRate) || 0;

  const gross = mode === "net" ? grossFromNet(input, whtRate) : input;
  const wht = round2((gross * whtRate) / 100);
  const vat = vatRate > 0 ? round2((gross * vatRate) / (100 + vatRate)) : 0;

  return { gross: round2(gross), vat, wht, net: round2(gross - wht) };
}

/** ยอดที่ควรตรงกับสลิปของรายการที่บันทึกไว้แล้ว (Net) */
export function expectedSlipAmount(row: { amount: number; wht_amount?: number | null }): number {
  return round2((Number(row.amount) || 0) - (Number(row.wht_amount) || 0));
}

export const formatBaht = (n: number) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });