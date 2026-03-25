export interface IncomeTypeOption {
  label: string;
  section: string;
  rate: number;
  pndType: "1" | "1ก" | "2" | "3" | "53";
}

export const INCOME_TYPES: IncomeTypeOption[] = [
  { label: "เงินเดือน / โบนัส (ม.40(1))", section: "40(1)", rate: 0, pndType: "1" },
  { label: "ค่านายหน้า / ฟรีแลนซ์ (ม.40(2))", section: "40(2)", rate: 3, pndType: "3" },
  { label: "ค่าบริการ / ค่าจ้างทำของ (ม.3 เตรส)", section: "3 เตรส", rate: 3, pndType: "3" },
  { label: "ค่าโฆษณา (ม.3 เตรส)", section: "3 เตรส", rate: 2, pndType: "3" },
  { label: "ค่าเช่า (ม.3 เตรส)", section: "3 เตรส", rate: 5, pndType: "3" },
  { label: "ค่าขนส่ง (ม.3 เตรส)", section: "3 เตรส", rate: 1, pndType: "3" },
  { label: "ค่าบริการ - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 3, pndType: "53" },
  { label: "ค่าโฆษณา - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 2, pndType: "53" },
  { label: "ค่าเช่า - นิติบุคคล (ม.3 เตรส)", section: "3 เตรส", rate: 5, pndType: "53" },
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
