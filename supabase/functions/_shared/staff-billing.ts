/**
 * ตัวอ่านข้อความแจ้งค่าจ้าง / สำรองจ่าย จากทีมงานในไลน์
 * อ่านแบบกติกาแน่นอน (ไม่ใช้ AI เดา) — ถ้าไม่ชัด ให้คืน kind = 'unknown' เพื่อให้ถามกลับด้วยปุ่ม
 *
 * แบบที่ 1  wage_days   : แจ้งวันทำงาน ไม่มียอด   → staff_invoices (หัก ณ ที่จ่าย)
 * แบบที่ 2  wage_amount : ค่าจ้างรายครั้ง มียอด    → staff_invoices (หัก ณ ที่จ่าย)
 * แบบที่ 3  advance     : สำรองจ่าย/ออกเงินไปก่อน → staff_expense_claims (ห้ามหักภาษี)
 */

export type StaffMessageKind = "wage_days" | "wage_amount" | "advance" | "unknown";

export interface StaffMessageDraft {
  kind: StaffMessageKind;
  amount: number | null;
  workStart: string | null;
  workEnd: string | null;
  days: number | null;
  dateRawText: string | null;
  description: string;
}

/** คำที่บอกว่าเป็น "สำรองจ่าย" — ห้ามหักภาษี ณ ที่จ่ายเด็ดขาด */
const ADVANCE_RE =
  /สำรอง|ออกให้ก่อน|ออกเงินไปก่อน|ออกเงินก่อน|ออกไปก่อน|จ่ายไปก่อน|จ่ายแทน|เบิกคืน|เบิกเงินคืน|ควักเอง|ออกค่า/;

/** คำที่บอกว่าเป็นค่าจ้าง/ค่าแรง */
const WAGE_RE = /ทำงาน|ค่าแรง|ค่าจ้าง|ค่าตัว|ปฏิบัติงาน|วันงาน|ลงงาน|ออกงาน/;

const THAI_MONTHS: Array<{ re: RegExp; m: number }> = [
  { re: /ม\.?ค\.?|มกรา(คม)?/, m: 1 },
  { re: /ก\.?พ\.?|กุมภา(พันธ์)?/, m: 2 },
  { re: /มี\.?ค\.?|มีนา(คม)?/, m: 3 },
  { re: /เม\.?ย\.?|เมษา(ยน)?/, m: 4 },
  { re: /พ\.?ค\.?|พฤษภา(คม)?/, m: 5 },
  { re: /มิ\.?ย\.?|มิถุนา(ยน)?/, m: 6 },
  { re: /ก\.?ค\.?|กรกฎา(คม)?/, m: 7 },
  { re: /ส\.?ค\.?|สิงหา(คม)?/, m: 8 },
  { re: /ก\.?ย\.?|กันยา(ยน)?/, m: 9 },
  { re: /ต\.?ค\.?|ตุลา(คม)?/, m: 10 },
  { re: /พ\.?ย\.?|พฤศจิกา(ยน)?/, m: 11 },
  { re: /ธ\.?ค\.?|ธันวา(คม)?/, m: 12 },
];

const THAI_MONTH_TOKEN =
  "(ม\\.?ค\\.?|มกราคม|มกรา|ก\\.?พ\\.?|กุมภาพันธ์|กุมภา|มี\\.?ค\\.?|มีนาคม|มีนา|เม\\.?ย\\.?|เมษายน|เมษา|พ\\.?ค\\.?|พฤษภาคม|พฤษภา|มิ\\.?ย\\.?|มิถุนายน|มิถุนา|ก\\.?ค\\.?|กรกฎาคม|กรกฎา|ส\\.?ค\\.?|สิงหาคม|สิงหา|ก\\.?ย\\.?|กันยายน|กันยา|ต\\.?ค\\.?|ตุลาคม|ตุลา|พ\\.?ย\\.?|พฤศจิกายน|พฤศจิกา|ธ\\.?ค\\.?|ธันวาคม|ธันวา)";

function monthFromThai(token: string): number | null {
  for (const { re, m } of THAI_MONTHS) if (re.test(token)) return m;
  return null;
}

/** ปี 2 หลัก / 4 หลัก → ค.ศ. (พ.ศ. ลบ 543) ถ้าไม่ใช่ปีที่เป็นไปได้ คืน null */
function normalizeYear(raw: string | undefined, todayYear: number): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.length === 4) {
    if (n >= 2500 && n <= 2600) return n - 543;
    if (n >= 2015 && n <= todayYear + 1) return n;
    return null;
  }
  if (raw.length === 2) {
    const be = 2500 + n;
    if (be - 543 >= 2015 && be - 543 <= todayYear + 1) return be - 543;
    const ce = 2000 + n;
    if (ce >= 2015 && ce <= todayYear + 1) return ce;
    return null;
  }
  return null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const isValidDay = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

interface DateHit {
  start: string;
  end: string;
  days: number;
  raw: string;
}

/**
 * รองรับ:  "20-22 ส.ค."  "20–22 สิงหาคม 69"  "22 ส.ค. 2569"  "20/8"  "20/8/69"  "20-22/8/69"
 * ไทยเขียน วัน-เดือน-ปี เสมอ — ห้ามตีความกลุ่มแรกเป็นปี
 */
export function parseWorkDates(text: string, today = new Date()): DateHit | null {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;

  // 1) วัน(-วัน) + เดือนไทย + ปี(ไม่บังคับ)
  const thaiRe = new RegExp(
    `(\\d{1,2})\\s*(?:[-–—]\\s*(\\d{1,2}))?\\s*${THAI_MONTH_TOKEN}\\s*(\\d{4}|\\d{2})?`,
  );
  const t = text.match(thaiRe);
  if (t) {
    const d1 = Number(t[1]);
    const d2 = t[2] ? Number(t[2]) : d1;
    const monthToken = t[3];
    const m = monthFromThai(monthToken);
    const yearToken = t[t.length - 1] as string | undefined;
    const y = normalizeYear(yearToken, ty);
    if (m) {
      const year = y ?? (m > tm + 1 ? ty - 1 : ty);
      // ถ้าเลขท้ายไม่ใช่ปีที่เป็นไปได้ (เช่น 3500 = ยอดเงิน) ต้องไม่กินเข้ามาในช่วงวันที่
      let raw = t[0].trim();
      if (yearToken && y === null) raw = raw.slice(0, raw.lastIndexOf(yearToken)).trim();
      if (isValidDay(year, m, d1) && isValidDay(year, m, d2) && d2 >= d1) {
        return { start: iso(year, m, d1), end: iso(year, m, d2), days: d2 - d1 + 1, raw };
      }
    }
  }

  // 2) วัน(-วัน)/เดือน(/ปี) แบบตัวเลข
  const numRe = /(\d{1,2})\s*(?:[-–—]\s*(\d{1,2}))?\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{4}|\d{2}))?/;
  const n = text.match(numRe);
  if (n) {
    const d1 = Number(n[1]);
    const d2 = n[2] ? Number(n[2]) : d1;
    const m = Number(n[3]);
    const y = normalizeYear(n[4], ty);
    const year = y ?? (m > tm + 1 ? ty - 1 : ty);
    if (m >= 1 && m <= 12 && isValidDay(year, m, d1) && isValidDay(year, m, d2) && d2 >= d1) {
      return {
        start: iso(year, m, d1),
        end: iso(year, m, d2),
        days: d2 - d1 + 1,
        raw: n[0].trim(),
      };
    }
  }

  return null;
}

/** ยอดเงิน — อ่านหลังตัดวันที่และรหัสงานออกแล้ว ห้ามเดา */
function parseAmount(rest: string): number | null {
  const matches = [...rest.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g)];
  const nums = matches
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return null;
  // ตัวเลขที่ตามด้วย "บาท" มาก่อน
  const baht = rest.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:บาท|฿|baht)/i);
  if (baht) return Number(baht[1].replace(/,/g, ""));
  return nums[nums.length - 1];
}

/** ตัดรหัสงาน (@CODE / *CODE / #CODE) และคำสั่งออก เหลือคำอธิบาย */
function buildDescription(text: string, dateRaw: string | null, amount: number | null): string {
  let s = text.replace(/[@*#][A-Za-z0-9][A-Za-z0-9_-]*/g, " ");
  if (dateRaw) s = s.split(dateRaw).join(" ");
  if (amount !== null) {
    s = s.replace(new RegExp(`\\b${amount}(?:\\.0+)?\\b`), " ");
    s = s.replace(new RegExp(amount.toLocaleString("en-US").replace(/,/g, "\\,")), " ");
  }
  return s.replace(/\s*(?:บาท|฿|baht)\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
}

export function parseStaffMessage(text: string, today = new Date()): StaffMessageDraft {
  const raw = (text || "").trim();
  const dateHit = parseWorkDates(raw, today);

  // ตัดวันที่ออกก่อนอ่านยอด เพื่อไม่ให้เลขวัน/เดือน/ปีถูกอ่านเป็นเงิน
  let rest = raw.replace(/[@*#][A-Za-z0-9][A-Za-z0-9_-]*/g, " ");
  if (dateHit) rest = rest.split(dateHit.raw).join(" ");
  const amount = parseAmount(rest);

  const isAdvance = ADVANCE_RE.test(raw);
  const isWage = WAGE_RE.test(raw);

  let kind: StaffMessageKind;
  if (isAdvance) kind = "advance";
  else if (amount !== null && (isWage || dateHit)) kind = "wage_amount";
  else if (dateHit && amount === null) kind = "wage_days";
  else if (isWage && amount === null) kind = "unknown"; // มีคำว่าทำงาน แต่ไม่รู้วัน → ต้องถาม
  else kind = "unknown";

  return {
    kind,
    amount,
    workStart: dateHit?.start ?? null,
    workEnd: dateHit?.end ?? null,
    days: dateHit?.days ?? null,
    dateRawText: dateHit?.raw ?? null,
    description: buildDescription(raw, dateHit?.raw ?? null, amount),
  };
}

/** ข้อความน่าจะเป็นการแจ้งค่าจ้าง/สำรองจ่าย (ก่อนเข้า parser) */
export function looksLikeStaffBilling(text: string): boolean {
  if (!text || text.length > 300) return false;
  if (ADVANCE_RE.test(text) || WAGE_RE.test(text)) return true;
  // มีรหัสงาน + ตัวเลข
  if (/[@*#][A-Za-z0-9]/.test(text) && /\d/.test(text)) return true;
  return false;
}
