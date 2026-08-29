// ===== Business Unit (entity) =====
// entity บอกว่า "เงินก้อนนี้เป็นเงินของใคร" แยกจาก category_group ที่บอกว่า "เป็นงานประเภทอะไร"
// entity ต้องมาจากทะเบียน (event_registry / การเลือกของผู้ใช้) เท่านั้น ห้ามให้ AI เดา

export type Entity = 'MENGXIN' | 'ACADEMY' | 'EDUCATION' | 'KUKANANG' | 'PERSONAL';

export const ENTITIES: { value: Entity; label: string; description: string; isCompany: boolean }[] = [
  { value: 'MENGXIN', label: 'เม้งซิน', description: 'บริษัท เม้งซิน เทรดดิ้ง (เงินบริษัท)', isCompany: true },
  { value: 'ACADEMY', label: 'อคาเดมี', description: 'Cruzee Academy / สนาม / คลาสเรียน', isCompany: false },
  { value: 'EDUCATION', label: 'BCC Next', description: 'งานการศึกษา / BCC Next', isCompany: false },
  { value: 'KUKANANG', label: 'คู่ขนาน', description: 'สนามคู่ขนาน พระราม 2', isCompany: false },
  { value: 'PERSONAL', label: 'ส่วนตัว', description: 'เงินส่วนตัว ไม่ใช่เงินกิจการ', isCompany: false },
];

export const DEFAULT_ENTITY: Entity = 'MENGXIN';

export const NON_MENGXIN_ENTITIES: Entity[] = ['ACADEMY', 'EDUCATION', 'KUKANANG', 'PERSONAL'];

export function entityLabel(entity?: string | null): string {
  return ENTITIES.find((e) => e.value === entity)?.label ?? 'ไม่ระบุ';
}

export function entityBadgeClass(entity?: string | null): string {
  switch (entity) {
    case 'MENGXIN': return 'bg-type-business/15 text-type-business border-type-business/30';
    case 'ACADEMY': return 'bg-group-program/15 text-group-program border-group-program/30';
    case 'EDUCATION': return 'bg-group-entity/15 text-group-entity border-group-entity/30';
    case 'KUKANANG': return 'bg-group-venue/15 text-group-venue border-group-venue/30';
    case 'PERSONAL': return 'bg-type-personal/15 text-type-personal border-type-personal/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

/**
 * เดา entity จาก project tag ที่ "เลือกจากทะเบียน" แล้วเท่านั้น (prefix เป็นข้อตกลงของระบบ)
 * ถ้าไม่ตรง prefix ใด ๆ ให้คืน null และปล่อยให้ผู้ใช้เลือก / ใช้ค่าจากทะเบียน
 */
export function entityFromProjectTag(tag?: string | null): Entity | null {
  const t = (tag || '').trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith('BCCNEXT-')) return 'EDUCATION';
  if (t.startsWith('KUKAN-')) return 'KUKANANG';
  if (t.startsWith('PROG-')) return 'ACADEMY';
  if (t === 'PERSONAL') return 'PERSONAL';
  if (t === 'OFFICE' || t.startsWith('EVT-')) return 'MENGXIN';
  return null;
}
