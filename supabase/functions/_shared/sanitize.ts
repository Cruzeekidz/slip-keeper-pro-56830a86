// ===== Placeholder sanitizer (edge functions) =====
// ห้ามเขียนคำว่า null/None/undefined/Unknown เป็น "ข้อความ" ลงฐานข้อมูล

const PLACEHOLDERS = new Set([
  "null", "nulll", "nil", "none", "undefined", "unknown", "ไม่ทราบ", "ไม่ระบุ",
  "n/a", "na", "no data", "-", "--", "?", "ยังไม่รู้",
]);

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export const CLEAN_FIELDS = [
  "project_tag", "event_name", "category_group", "subcategory", "category",
  "description", "merchant", "sender", "receiver", "staff_name", "payee_group", "entity",
];

/** ล้าง placeholder ทุกฟิลด์ข้อความก่อน insert/update ตาราง expenses */
export function sanitizeExpense<T extends Record<string, any>>(row: T): T {
  const out: Record<string, any> = { ...row };
  for (const f of CLEAN_FIELDS) {
    if (f in out) out[f] = cleanText(out[f]);
  }
  return out as T;
}
