export type PayeeKind = "individual" | "juristic" | "both";

export interface IncomeTypeOption {
  label: string;
  section: string;
  rate: number;
  pndType: "1" | "1ก" | "2" | "3" | "53";
  /** บุคคลธรรมดา (ภ.ง.ด.3) หรือ นิติบุคคล (ภ.ง.ด.53) */
  payeeKind?: PayeeKind;
}

/**
 * ⚠️ ลำดับของรายการนี้ถูกอ้างอิงด้วย index ใน wht_certificate_items.income_type_index
 * ห้ามแทรกกลาง / สลับลำดับ — เพิ่มรายการใหม่ต่อท้ายเท่านั้น
 */
export const INCOME_TYPES: IncomeTypeOption[] = [
  { label: "เงินเดือน / โบนัส (ม.40(1))", section: "40(1)", rate: 0, pndType: "1", payeeKind: "individual" },
  { label: "ค่านายหน้า / ฟรีแลนซ์ (ม.40(2))", section: "40(2)", rate: 3, pndType: "3", payeeKind: "individual" },
  { label: "ค่าบริการ / ค่าจ้างทำของ (ม.3 เตรส)", section: "3 เตรส", rate: 3, pndType: "3", payeeKind: "individual" },
  { label: "ค่าโฆษณา (ม.3 เตรส)", section: "3 เตรส", rate: 2, pndType: "3", payeeKind: "individual" },
  { label: "ค่าเช่า (ม.3 เตรส)", section: "3 เตรส", rate: 5, pndType: "3", payeeKind: "individual" },
  { label: "ค่าขนส่ง (ม.3 เตรส)", section: "3 เตรส", rate: 1, pndType: "3", payeeKind: "individual" },
  { label: "ค่าบริการ - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 3, pndType: "53", payeeKind: "juristic" },
  { label: "ค่าโฆษณา - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 2, pndType: "53", payeeKind: "juristic" },
  { label: "ค่าเช่า - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 5, pndType: "53", payeeKind: "juristic" },
  // เพิ่มเติม (ต่อท้ายเท่านั้น)
  { label: "ค่าจ้างทำของ / รับเหมา (ม.40(7)-(8))", section: "3 เตรส", rate: 3, pndType: "3", payeeKind: "individual" },
  { label: "ค่าจ้างทำของ / รับเหมา - นิติบุคคล", section: "3 เตรส", rate: 3, pndType: "53", payeeKind: "juristic" },
  { label: "ค่าวิชาชีพอิสระ (ม.40(6))", section: "40(6)", rate: 3, pndType: "3", payeeKind: "individual" },
  { label: "ค่าวิชาชีพอิสระ - นิติบุคคล (ม.40(6))", section: "40(6)", rate: 3, pndType: "53", payeeKind: "juristic" },
  { label: "ค่าขนส่ง - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 1, pndType: "53", payeeKind: "juristic" },
  { label: "รางวัล / ส่วนลดส่งเสริมการขาย (ม.3 เตรส)", section: "3 เตรส", rate: 3, pndType: "3", payeeKind: "individual" },
  { label: "รางวัล / ส่วนลดส่งเสริมการขาย - นิติบุคคล", section: "3 เตรส", rate: 3, pndType: "53", payeeKind: "juristic" },
  { label: "ค่าจ้างทำของ - ผู้รับจ้างต่างประเทศ / อื่น ๆ 5%", section: "3 เตรส", rate: 5, pndType: "53", payeeKind: "juristic" },
  { label: "ดอกเบี้ย (ม.40(4)(ก))", section: "40(4)(ก)", rate: 1, pndType: "53", payeeKind: "juristic" },
  { label: "เงินปันผล (ม.40(4)(ข))", section: "40(4)(ข)", rate: 10, pndType: "2", payeeKind: "both" },
  { label: "ค่าเบี้ยประกันวินาศภัย (ม.3 เตรส)", section: "3 เตรส", rate: 1, pndType: "53", payeeKind: "juristic" },
];

export const PND_TYPES = [
  { value: "1", label: "ภ.ง.ด.1" },
  { value: "1ก", label: "ภ.ง.ด.1ก" },
  { value: "2", label: "ภ.ง.ด.2" },
  { value: "3", label: "ภ.ง.ด.3" },
  { value: "53", label: "ภ.ง.ด.53" },
];

export const PAYER_CONDITION_OPTIONS = [
  { value: "deducted", label: "หัก ณ ที่จ่าย" },
  { value: "paid_forever", label: "ออกให้ตลอดไป" },
  { value: "paid_once", label: "ออกให้ครั้งเดียว" },
];
