// ===== Category System =====
// 3 top-level transaction types, with ENTITY support

export type TransactionType = 'TRANSFER' | 'BUSINESS' | 'PERSONAL';
export type CategoryGroup = 'EVENT' | 'PROGRAM' | 'VENUE' | 'GENERAL' | 'ENTITY_KUKANANG' | 'ENTITY_BCC';
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
  { value: 'ENTITY_KUKANANG', label: 'คู่ขนาน', color: 'bg-group-entity text-group-entity-foreground' },
  { value: 'ENTITY_BCC', label: 'BCC', color: 'bg-group-entity text-group-entity-foreground' },
  { value: 'GENERAL', label: 'ทั่วไป', color: 'bg-group-general text-group-general-foreground' },
];

export const TRANSFER_SUBCATEGORIES = [
  'จ่ายบัตรเครดิต',
  'คืนหนี้/เงินยืม',
  'โอนข้ามบัญชี',
  'ผ่อนชำระ',
];

export const EVENT_EXPENSE_SUBCATEGORIES = [
  'Staff', 'Printing', 'Venue', 'Prizes', 'Transport', 'Marketing', 'Refund', 'Other',
];

export const EVENT_INCOME_SUBCATEGORIES = [
  'Registration', 'Sponsorship', 'Product Sales', 'Other Income',
];

export const PROGRAM_SUBCATEGORIES = [
  'Staff', 'Equipment', 'Venue', 'Other',
];

export const VENUE_SUBCATEGORIES = [
  'Stock (น้ำ/ไอติม)', 'Maintenance', 'Utilities', 'Other',
];

export const GENERAL_SUBCATEGORIES = [
  'Salary', 'Marketing & Ads', 'Accounting', 'Consulting', 'Vehicle',
  'Software & Subscription', 'Legal', 'Logistics', 'Investment', 'Utilities', 'Other',
];

export const ENTITY_SUBCATEGORIES = [
  'Staff', 'Venue', 'Equipment', 'Marketing', 'Utilities', 'Other',
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
      case 'ENTITY_BCC':
        return ENTITY_SUBCATEGORIES;
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
    if (group === 'ENTITY_KUKANANG' || group === 'ENTITY_BCC') return 'bg-group-entity/15 text-group-entity border-group-entity/30';
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
  return group === 'EVENT' || group === 'PROGRAM';
}
