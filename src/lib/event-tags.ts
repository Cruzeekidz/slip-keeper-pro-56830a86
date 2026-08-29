/**
 * Event tag selection model.
 * Humans pick an event name, the system stores the code in expenses.project_tag.
 */
export const FIXED_TAGS = {
  PERSONAL: "PERSONAL",
  OFFICE: "OFFICE",
  UNKNOWN: "UNKNOWN",
} as const;

export interface EventTagOption {
  tag: string;
  name: string;
  date: string | null;
  /** หน่วยธุรกิจที่มาจากทะเบียน (ไม่ใช่ AI เดา) */
  entity?: string | null;
  fixed?: boolean;
  inWindow?: boolean;
}

export const FIXED_TAG_OPTIONS: EventTagOption[] = [
  { tag: FIXED_TAGS.PERSONAL, name: "ส่วนตัว", date: null, entity: "PERSONAL", fixed: true, inWindow: true },
  { tag: FIXED_TAGS.OFFICE, name: "ออฟฟิศทั่วไป", date: null, entity: "MENGXIN", fixed: true, inWindow: true },
  { tag: FIXED_TAGS.UNKNOWN, name: "ยังไม่รู้", date: null, entity: null, fixed: true, inWindow: true },
];


/** "ยังไม่รู้" always sends the slip to the review queue. */
export function isUnknownTag(tag?: string | null): boolean {
  return tag === FIXED_TAGS.UNKNOWN;
}

const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function formatThaiShortDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const be = (d.getFullYear() + 543) % 100;
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${be}`;
}

export function eventOptionLabel(o: EventTagOption): string {
  const dateLabel = formatThaiShortDate(o.date);
  return dateLabel ? `${o.name} · ${dateLabel}` : o.name;
}

/** Registry rows → options: active + within −60/+90 days first, nearest date first. */
export function buildEventOptions(
  rows: Array<{ event_name: string; project_tag: string; event_date: string | null; is_active: boolean; entity?: string | null }>,
  now: Date = new Date(),
): EventTagOption[] {
  const today = now.getTime();
  const before = 60 * 24 * 3600 * 1000;
  const after = 90 * 24 * 3600 * 1000;

  const mapped = rows
    .filter((r) => r.project_tag)
    .map((r) => {
      const t = r.event_date ? new Date(r.event_date).getTime() : NaN;
      const diff = Number.isNaN(t) ? Number.POSITIVE_INFINITY : t - today;
      const inWindow =
        r.is_active && !Number.isNaN(t) && diff <= after && diff >= -before;
      return {
        tag: r.project_tag,
        name: r.event_name || r.project_tag,
        date: r.event_date,
        entity: r.entity ?? null,
        inWindow,
        _abs: Math.abs(diff),
      };
    });

  mapped.sort((a, b) => a._abs - b._abs);
  return mapped.map(({ _abs, ...o }) => o);
}

/** entity ของแท็กที่เลือก: ใช้ค่าจากทะเบียนก่อน ถ้าไม่มีจึงอนุมานจาก prefix ที่ระบบกำหนด */
export function resolveEntityForTag(
  tag: string | null | undefined,
  options: EventTagOption[],
): string | null {
  if (!tag) return null;
  const hit = options.find((o) => o.tag === tag);
  if (hit?.entity) return hit.entity;
  const t = tag.trim().toUpperCase();
  if (t.startsWith("BCCNEXT-")) return "EDUCATION";
  if (t.startsWith("KUKAN-")) return "KUKANANG";
  if (t.startsWith("PROG-")) return "ACADEMY";
  if (t === "PERSONAL") return "PERSONAL";
  if (t === "OFFICE" || t.startsWith("EVT-")) return "MENGXIN";
  return null;
}

