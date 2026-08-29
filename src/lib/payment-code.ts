/**
 * รหัสตัดจ่ายในช่องบันทึกช่วยจำของสลิป
 *   @B0042 → ตัดบิลใบเดียว (vendor_invoices.receipt_no)
 *   @P0007 → ตัดทุกบิลในใบสรุปการจ่าย (payment_vouchers.voucher_number)
 *
 * ใช้สัญลักษณ์เดียวกับรหัสงาน: @ เป็นหลัก, * และ # เป็นตัวสำรอง
 * กติกา: ตรงทั้งคำเท่านั้น ไม่ตรงเป๊ะห้ามเดา · เจอหลายรหัสให้ติดธงให้คนเลือก
 */

const CODE_TOKEN = /[@*#]\s*([A-Za-z]\d{3,})/g;

export type PaymentCodeStatus = "none" | "bill" | "voucher" | "ambiguous";

export interface PaymentCodeResult {
  codes: string[];
  status: PaymentCodeStatus;
  billNo: string | null;
  voucherNo: string | null;
  reason: string | null;
}

export function extractPaymentCodes(...texts: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    CODE_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CODE_TOKEN.exec(text)) !== null) {
      const code = m[1].toUpperCase();
      if (/^[BP]\d{4,}$/.test(code) && !found.includes(code)) found.push(code);
    }
  }
  return found;
}

export function resolvePaymentCode(...texts: Array<string | null | undefined>): PaymentCodeResult {
  const codes = extractPaymentCodes(...texts);
  if (!codes.length) {
    return { codes, status: "none", billNo: null, voucherNo: null, reason: null };
  }
  if (codes.length > 1) {
    return {
      codes,
      status: "ambiguous",
      billNo: null,
      voucherNo: null,
      reason: `พบรหัสตัดจ่ายมากกว่า 1 รหัสในสลิปเดียว (${codes.map((c) => "@" + c).join(", ")}) กรุณาเลือกเอง`,
    };
  }
  const code = codes[0];
  if (code.startsWith("P")) {
    return { codes, status: "voucher", billNo: null, voucherNo: code, reason: null };
  }
  return { codes, status: "bill", billNo: code, voucherNo: null, reason: null };
}

export const PAYMENT_CODE_HELP =
  "พิมพ์รหัสตัดจ่ายในช่องบันทึกช่วยจำของสลิป เช่น @B0042 (บิลใบเดียว) หรือ @P0007 (ใบสรุปการจ่าย)";
