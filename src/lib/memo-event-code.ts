/**
 * รหัสงานในช่องบันทึกช่วยจำของสลิป
 *
 * แอพธนาคารพิมพ์ `#` ไม่ได้ จึงใช้ `@` เป็นหลัก, `*` เป็นตัวสำรอง
 * และยังรองรับ `#` ต่อไปสำหรับสลิปเก่า
 *
 * กติกา: จับคู่ตรงทั้งคำเท่านั้น ห้าม contains/LIKE ห้ามเดารหัสใกล้เคียง
 */

export const CODE_PREFIXES = ["@", "*", "#"] as const;
export const PRIMARY_PREFIX = "@";

const CODE_TOKEN = /[@*#]\s*([A-Za-z0-9][A-Za-z0-9_-]*)/g;

export interface RegistryTagRow {
  project_tag: string | null;
  event_name?: string | null;
  aliases?: string[] | null;
}

export type EventCodeStatus =
  | "none" // ไม่พบรหัสในบันทึกช่วยจำ
  | "matched" // รหัสตรงทะเบียนหนึ่งรายการ
  | "unknown" // มีรหัสแต่ไม่ตรงทะเบียน
  | "ambiguous"; // เจอมากกว่า 1 รหัส ต้องให้คนเลือก

export interface EventCodeResult {
  codes: string[];
  tag: string | null;
  status: EventCodeStatus;
  needsReview: boolean;
  reason: string | null;
}

/** ดึงรหัสงานทุกตัวที่มีสัญลักษณ์นำหน้า (@ * #) ออกมาแบบตรงตัว ไม่แก้ตัวสะกด */
export function extractEventCodes(...texts: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    CODE_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CODE_TOKEN.exec(text)) !== null) {
      const code = m[1].trim().toUpperCase();
      if (code && !found.includes(code)) found.push(code);
    }
  }
  return found;
}

/** รหัสทั้งหมดที่แถวทะเบียนหนึ่งรับได้ (tag เต็ม, ตัด EVT- ออก, และ aliases) */
function candidateCodes(row: RegistryTagRow): string[] {
  const out = new Set<string>();
  const push = (v?: string | null) => {
    const s = (v || "").trim().toUpperCase();
    if (!s) return;
    out.add(s);
    if (s.startsWith("EVT-")) out.add(s.slice(4));
  };
  push(row.project_tag);
  for (const a of row.aliases || []) push(a);
  return [...out];
}

/**
 * จับคู่รหัสที่อ่านได้กับทะเบียนงาน — ตรงทั้งคำเท่านั้น
 * ไม่ตรง → tag = null + needsReview พร้อมเหตุผล (ห้ามเดา)
 */
export function resolveEventCode(codes: string[], rows: RegistryTagRow[]): EventCodeResult {
  if (!codes.length) {
    return {
      codes: [],
      tag: null,
      status: "none",
      needsReview: false,
      reason: null,
    };
  }

  const index = new Map<string, string>(); // code (exact) → project_tag
  for (const row of rows) {
    const tag = (row.project_tag || "").trim();
    if (!tag) continue;
    for (const code of candidateCodes(row)) {
      if (!index.has(code)) index.set(code, tag);
    }
  }

  const resolved: string[] = [];
  const unmatched: string[] = [];
  for (const code of codes) {
    const tag = index.get(code);
    if (tag) {
      if (!resolved.includes(tag)) resolved.push(tag);
    } else {
      unmatched.push(code);
    }
  }

  if (codes.length > 1 || resolved.length > 1) {
    return {
      codes,
      tag: null,
      status: "ambiguous",
      needsReview: true,
      reason: `พบรหัสงานมากกว่า 1 รหัสในสลิปเดียว (${codes.map((c) => PRIMARY_PREFIX + c).join(", ")}) กรุณาเลือกงานที่ถูกต้อง`,
    };
  }

  if (resolved.length === 1) {
    return { codes, tag: resolved[0], status: "matched", needsReview: false, reason: null };
  }

  return {
    codes,
    tag: null,
    status: "unknown",
    needsReview: true,
    reason: `รหัสงาน ${PRIMARY_PREFIX}${unmatched[0]} ไม่ตรงกับทะเบียนงาน กรุณาเลือกงานด้วยตนเอง`,
  };
}

/** ข้อความช่วยเหลือมาตรฐาน (ใช้ทั้งบนจอและใน LINE) */
export const EVENT_CODE_HELP =
  `พิมพ์รหัสงานในช่องบันทึกช่วยจำของสลิป โดยขึ้นต้นด้วย ${PRIMARY_PREFIX} เช่น ${PRIMARY_PREFIX}MHC26 ค่าเหรียญ (ใช้ * แทนได้)`;

/** ส่วนที่ต่อเข้าไปใน prompt ของ OCR ทุกช่องทาง */
export function eventCodePromptSection(): string {
  return `

## 🏷️ รหัสงานในช่องบันทึกช่วยจำ (สำคัญมาก!)
ในสลิปมักมี "ช่องบันทึกช่วยจำ / บันทึก / Memo / Note" ให้อ่านข้อความนั้นออกมาแบบดิบ ๆ ใส่ในฟิลด์ slip_memo
ถ้ามีข้อความที่ขึ้นต้นด้วย ${CODE_PREFIXES.join(" หรือ ")} เช่น "@MHC26", "*CKB-W", "#WW4" นั่นคือ **รหัสงาน**
- คัดลอกรหัสมาแบบตรงตัวทุกตัวอักษร ห้ามแก้ตัวสะกด ห้ามเติม ห้ามตัด ใส่ในฟิลด์ event_codes (เป็น array ของข้อความ เช่น ["MHC26"])
- ถ้ามีหลายรหัส ให้ใส่ให้ครบทุกตัว
- ถ้าไม่มีรหัสที่มีสัญลักษณ์นำหน้า ให้ event_codes = [] และ **ห้ามเดา project_tag จากชื่อสถานที่หรือชื่องานในข้อความ**
- ระบบจะจับคู่รหัสกับทะเบียนงานเอง คุณไม่ต้องเดา project_tag`;
}
