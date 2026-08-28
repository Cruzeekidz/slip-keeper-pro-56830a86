// Deterministic Thai slip date parser (day-first, ห้ามเดา)
// Keep in sync with src/lib/slip-date.ts

const TH_MONTHS: Record<string, number> = {
  "ม.ค": 1, "มค": 1, "มกราคม": 1, jan: 1, january: 1,
  "ก.พ": 2, "กพ": 2, "กุมภาพันธ์": 2, feb: 2, february: 2,
  "มี.ค": 3, "มีค": 3, "มีนาคม": 3, mar: 3, march: 3,
  "เม.ย": 4, "เมย": 4, "เมษายน": 4, apr: 4, april: 4,
  "พ.ค": 5, "พค": 5, "พฤษภาคม": 5, may: 5,
  "มิ.ย": 6, "มิย": 6, "มิถุนายน": 6, jun: 6, june: 6,
  "ก.ค": 7, "กค": 7, "กรกฎาคม": 7, jul: 7, july: 7,
  "ส.ค": 8, "สค": 8, "สิงหาคม": 8, aug: 8, august: 8,
  "ก.ย": 9, "กย": 9, "กันยายน": 9, sep: 9, sept: 9, september: 9,
  "ต.ค": 10, "ตค": 10, "ตุลาคม": 10, oct: 10, october: 10,
  "พ.ย": 11, "พย": 11, "พฤศจิกายน": 11, nov: 11, november: 11,
  "ธ.ค": 12, "ธค": 12, "ธันวาคม": 12, dec: 12, december: 12,
};

function normalizeYear(rawYear: string, now: Date): number | null {
  const n = parseInt(rawYear, 10);
  if (Number.isNaN(n)) return null;
  if (rawYear.length >= 4) {
    return n >= 2500 ? n - 543 : n;
  }
  // 2-digit year: greater than the current CE 2-digit year → Buddhist Era
  const cur2 = now.getFullYear() % 100;
  if (n > cur2) return 2500 + n - 543;
  return 2000 + n;
}

function build(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 2015 || y > new Date().getFullYear() + 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse the raw date text exactly as printed on a Thai slip.
 * Order is ALWAYS day → month → year. Never guess.
 */
export function parseSlipDateRaw(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Already ISO with 4-digit year first
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (iso) {
    const y = normalizeYear(iso[1], now);
    return y ? build(y, parseInt(iso[2], 10), parseInt(iso[3], 10)) : null;
  }

  // dd/mm/yy(yy) — day first, always
  const num = /(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})/.exec(s);
  if (num) {
    const y = normalizeYear(num[3], now);
    return y ? build(y, parseInt(num[2], 10), parseInt(num[1], 10)) : null;
  }

  // "1 ก.พ. 67" / "26 ส.ค. 2569" / "6 Jun 26"
  const named = /(\d{1,2})\s*([ก-๙A-Za-z.]{2,12}?)\.?\s*(\d{2,4})/.exec(s.replace(/\u200b/g, ""));
  if (named) {
    const key = named[2].toLowerCase().replace(/\.$/, "");
    const month = TH_MONTHS[key] ?? TH_MONTHS[key.replace(/\./g, "")];
    const y = normalizeYear(named[3], now);
    if (month && y) return build(y, month, parseInt(named[1], 10));
  }

  return null;
}
