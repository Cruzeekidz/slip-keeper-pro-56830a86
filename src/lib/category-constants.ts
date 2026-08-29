// ===== Category System =====
// 3 top-level transaction types, with ENTITY support

export type TransactionType = 'TRANSFER' | 'BUSINESS' | 'PERSONAL';
export type CategoryGroup = 'EVENT' | 'PROGRAM' | 'VENUE' | 'GENERAL' | 'ENTITY_KUKANANG' | 'ENTITY_BCC_NEXT';
export type TransactionDirection = 'INCOME' | 'EXPENSE';

export const TRANSACTION_TYPES: { value: TransactionType; label: string; color: string }[] = [
  { value: 'TRANSFER', label: 'โอนเงิน', color: 'bg-type-transfer text-type-transfer-foreground' },
  { value: 'BUSINESS', label: 'ธุรกิจ', color: 'bg-type-business text-type-business-foreground' },
  { value: 'PERSONAL', label: 'ส่วนตัว', color: 'bg-type-personal text-type-personal-foreground' },
];

export const TRANSACTION_DIRECTIONS: { value: TransactionDirection; label: string }[] = [
  { value: 'EXPENSE', label: 'รายจ่าย' },
  { value: 'INCOME', label: 'รายรับ' },
];

export const CATEGORY_GROUPS: { value: CategoryGroup; label: string; color: string }[] = [
  { value: 'EVENT', label: 'อีเวนท์', color: 'bg-group-event text-group-event-foreground' },
  { value: 'PROGRAM', label: 'โปรแกรม', color: 'bg-group-program text-group-program-foreground' },
  { value: 'VENUE', label: 'สนาม', color: 'bg-group-venue text-group-venue-foreground' },
  { value: 'ENTITY_BCC_NEXT', label: 'BCC Next', color: 'bg-group-entity text-group-entity-foreground' },
  { value: 'ENTITY_KUKANANG', label: 'คู่ขนาน', color: 'bg-group-entity text-group-entity-foreground' },
  { value: 'GENERAL', label: 'ทั่วไป', color: 'bg-group-general text-group-general-foreground' },
];

export const TRANSFER_SUBCATEGORIES = [
  'จ่ายบัตรเครดิต',
  'คืนหนี้/เงินยืม',
  'โอนข้ามบัญชี',
  'ผ่อนชำระ',
];

// ===== Subcategory vocabulary (ตรงกับ ReadyGo) =====
// ใช้กับรายจ่ายฝั่งธุรกิจทุกกลุ่ม (EVENT / PROGRAM / VENUE / GENERAL)
export const READYGO_EXPENSE_SUBCATEGORIES = [
  'trophy', 'medal', 'giveaway', 'race_kit', 'freelance', 'staff', 'mc_fee',
  'transport', 'food', 'printing', 'venue_rental', 'advertising', 'insurance',
  'equipment', 'other_expense',
] as const;

export type ExpenseSubcategory = typeof READYGO_EXPENSE_SUBCATEGORIES[number];

export const SUBCATEGORY_LABELS: Record<string, string> = {
  trophy: 'ถ้วยรางวัล',
  medal: 'เหรียญรางวัล',
  giveaway: 'ของแจก/ของที่ระลึก',
  race_kit: 'Race Kit (ป้ายเบอร์/เสื้อ)',
  freelance: 'ฟรีแลนซ์/จ้างภายนอก',
  staff: 'ทีมงาน/ค่าแรง',
  mc_fee: 'ค่าพิธีกร (MC)',
  transport: 'ขนส่ง/เดินทาง',
  food: 'อาหารและเครื่องดื่ม',
  printing: 'งานพิมพ์',
  venue_rental: 'ค่าเช่าสถานที่',
  advertising: 'โฆษณา/การตลาด',
  insurance: 'ประกันภัย',
  equipment: 'อุปกรณ์',
  other_expense: 'อื่น ๆ',
};

export function subcategoryLabel(value?: string | null): string {
  if (!value) return '-';
  return SUBCATEGORY_LABELS[value] || value;
}

/** หมวดย่อยที่ต้องระบุจำนวนชิ้น เพื่อกระทบยอดกับจำนวนผู้สมัคร ReadyGo */
export const QUANTITY_SUBCATEGORIES = ['race_kit', 'medal', 'trophy', 'giveaway'];

export const EVENT_EXPENSE_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];

export const EVENT_INCOME_SUBCATEGORIES = [
  'Registration', 'Sponsorship', 'Product Sales', 'Other Income',
];

export const PROGRAM_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];

export const VENUE_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];

export const GENERAL_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];

export const ENTITY_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];

export const BCC_NEXT_SUBCATEGORIES = [...READYGO_EXPENSE_SUBCATEGORIES];


export const DEFAULT_BCC_NEXT_TAGS = [
  'BCCNEXT-PecaBridge', 'BCCNEXT-EngineerX25-T1', 'BCCNEXT-EngineerX25-T2', 'BCCNEXT-PlayBox2026',
];

export const PERSONAL_SUBCATEGORIES = [
  'Food & Drinks', 'Health & Wellness', 'Transport', 'Family & Kids',
  'Self-Development', 'Donation', 'Entertainment', 'Insurance', 'Shopping', 'Other',
];

export const DEFAULT_EVENT_TAGS = [
  'EVT-Rockstar3', 'EVT-KMT41', 'EVT-คู่ขนาน',
];

export const DEFAULT_PROGRAM_TAGS = [
  'PROG-BikeClass', 'PROG-InlineSkate',
];

export const DEFAULT_KUKANANG_TAGS = [
  'KUKAN-BikeClass', 'KUKAN-InlineSkate',
];

export function getSubcategoriesForType(
  type: TransactionType | null,
  group: CategoryGroup | null,
  direction: TransactionDirection = 'EXPENSE'
): string[] {
  if (type === 'TRANSFER') return TRANSFER_SUBCATEGORIES;
  if (type === 'PERSONAL') return PERSONAL_SUBCATEGORIES;
  if (type === 'BUSINESS') {
    switch (group) {
      case 'EVENT':
        return direction === 'INCOME' ? EVENT_INCOME_SUBCATEGORIES : EVENT_EXPENSE_SUBCATEGORIES;
      case 'PROGRAM': return PROGRAM_SUBCATEGORIES;
      case 'VENUE': return VENUE_SUBCATEGORIES;
      case 'ENTITY_KUKANANG':
        return ENTITY_SUBCATEGORIES;
      case 'ENTITY_BCC_NEXT':
        return BCC_NEXT_SUBCATEGORIES;
      case 'GENERAL': return GENERAL_SUBCATEGORIES;
      default: return [];
    }
  }
  return [];
}

export function getDefaultProjectTags(group: CategoryGroup | null): string[] {
  switch (group) {
    case 'EVENT': return DEFAULT_EVENT_TAGS;
    case 'PROGRAM': return DEFAULT_PROGRAM_TAGS;
    case 'ENTITY_BCC_NEXT': return DEFAULT_BCC_NEXT_TAGS;
    case 'ENTITY_KUKANANG': return DEFAULT_KUKANANG_TAGS;
    default: return [];
  }
}

export function getTypeColor(type: TransactionType | null): string {
  switch (type) {
    case 'TRANSFER': return 'text-type-transfer';
    case 'BUSINESS': return 'text-type-business';
    case 'PERSONAL': return 'text-type-personal';
    default: return 'text-muted-foreground';
  }
}

export function getTypeBadgeClass(type: TransactionType | null, group?: CategoryGroup | null): string {
  if (type === 'TRANSFER') return 'bg-type-transfer/15 text-type-transfer border-type-transfer/30';
  if (type === 'PERSONAL') return 'bg-type-personal/15 text-type-personal border-type-personal/30';
  if (type === 'BUSINESS') {
    if (group === 'EVENT') return 'bg-group-event/15 text-group-event border-group-event/30';
    if (group === 'PROGRAM') return 'bg-group-program/15 text-group-program border-group-program/30';
    if (group === 'VENUE') return 'bg-group-venue/15 text-group-venue border-group-venue/30';
    if (group === 'ENTITY_KUKANANG') return 'bg-group-entity/15 text-group-entity border-group-entity/30';
    if (group === 'ENTITY_BCC_NEXT') return 'bg-group-entity/15 text-group-entity border-group-entity/30';
    return 'bg-group-general/15 text-group-general border-group-general/30';
  }
  return 'bg-muted text-muted-foreground';
}

export function formatTypeLabel(type: TransactionType | null, group?: CategoryGroup | null, tag?: string | null): string {
  if (!type) return 'ไม่ระบุ';
  const typeInfo = TRANSACTION_TYPES.find(t => t.value === type);
  if (type === 'TRANSFER') return typeInfo?.label || 'โอนเงิน';
  if (type === 'PERSONAL') return typeInfo?.label || 'ส่วนตัว';
  if (type === 'BUSINESS' && group) {
    const groupInfo = CATEGORY_GROUPS.find(g => g.value === group);
    const base = `ธุรกิจ > ${groupInfo?.label || group}`;
    return tag ? `${base} > ${tag}` : base;
  }
  return typeInfo?.label || type;
}

export function showProjectTag(group: CategoryGroup | null): boolean {
  return group === 'EVENT' || group === 'PROGRAM' || group === 'ENTITY_BCC_NEXT' || group === 'ENTITY_KUKANANG';
}
