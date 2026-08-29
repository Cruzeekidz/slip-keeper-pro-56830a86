// ===== Placeholder sanitizer =====
// ห้ามเขียนคำว่า null/None/undefined/Unknown เป็น "ข้อความ" ลงฐานข้อมูล
// ถ้าไม่มีค่า ต้องเป็น SQL NULL จริงเท่านั้น

const PLACEHOLDERS = new Set([
  'null', 'nulll', 'nil', 'none', 'undefined', 'unknown', 'ไม่ทราบ', 'ไม่ระบุ',
  'n/a', 'na', 'no data', '-', '--', '?', 'ยังไม่รู้',
]);

/** คืนค่าข้อความที่สะอาด หรือ null ถ้าเป็นค่าว่าง/คำ placeholder */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && cleanText(value) === null && value.trim().length > 0;
}

/** ล้างทุกฟิลด์ข้อความที่ระบุใน object ให้เป็น null เมื่อเป็น placeholder */
export function cleanFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const out = { ...obj };
  for (const f of fields) {
    if (f in out) (out as any)[f] = cleanText(out[f]);
  }
  return out;
}

export const TEXT_FIELDS_TO_CLEAN = [
  'project_tag', 'event_name', 'category_group', 'subcategory', 'category',
  'description', 'merchant', 'sender', 'receiver', 'staff_name', 'payee_group', 'entity',
];
