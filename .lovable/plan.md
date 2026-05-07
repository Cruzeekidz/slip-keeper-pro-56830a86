## เป้าหมาย
1. ให้รายการ "เบิกคืนพนักงาน" บันทึกเข้า `expenses` พร้อม `category_group` ที่ถูกต้อง (ไม่ hardcode `EVENT`) + ส่ง VAT/WHT อัตโนมัติ
2. เพิ่มหน้าสรุปแยก "ค่าใช้จ่ายบริษัท (ตรง)" vs "เบิกคืนทีมงาน" ตามหมวด/ร้าน/โปรเจ็ค

---

## 1. Schema migration
เพิ่มฟิลด์ใน `staff_expense_claims` เพื่อเก็บ context การลงบัญชี:
- `category_group text` (เช่น `EVENT`, `GENERAL`, `ENTITY_BCC_NEXT`, `VENUE`...)
- `project_tag text`
- `vat_amount numeric default 0`, `vat_rate numeric default 0`
- `wht_amount numeric default 0`, `wht_rate numeric default 0`

(`vendor_invoices` มี vat/wht อยู่แล้ว — จะดึงค่าจากบิลถ้าผูก)

---

## 2. ฟอร์มเบิก/ผูกบิล (`StaffReimbursementTab.tsx` + `ExpenseClaimSection.tsx`)
- ใน dialog "ผูกบิลกับใบเบิก" และฟอร์มสร้าง claim: เพิ่ม dropdown "กลุ่มค่าใช้จ่าย" (ใช้ `CATEGORY_GROUPS`) + ช่อง project tag (เลือกตามกลุ่ม)
- Default logic: ถ้ามี `event_name` → `EVENT`; ไม่มี → `GENERAL`
- ถ้าผูกจาก `vendor_invoices` ที่มี vat/wht อยู่แล้ว → prefill ลง claim

## 3. การจ่ายคืน → สร้าง expense (`reimburseMutation`)
แก้ insert ให้ใช้ค่าจาก claim:
```ts
category_group: claim.category_group ?? (claim.event_name ? "EVENT" : "GENERAL"),
project_tag: claim.project_tag ?? null,
vat_amount: claim.vat_amount, vat_rate: claim.vat_rate,
wht_amount: claim.wht_amount, wht_rate: claim.wht_rate,
amount_input_mode: "gross",
```
(ลบ `category_group: "EVENT"` hardcoded)

## 4. หน้าสรุปใหม่ `/reimbursement-summary`
ไฟล์ใหม่ `src/pages/ReimbursementSummary.tsx` + เพิ่ม route ใน `App.tsx` + ลิงก์เข้าจาก Dashboard

UI:
- Filter ช่วงเวลา (preset เหมือน `ProjectSummary`)
- ตาราง 2 ฝั่งเทียบกัน: 
  - **ค่าใช้จ่ายบริษัทตรง** = `expenses` ที่ `transaction_type='BUSINESS'` AND `subcategory != 'เบิกคืนทีมงาน'`
  - **เบิกคืนทีมงาน** = `subcategory = 'เบิกคืนทีมงาน'`
- กลุ่มตาม `category_group` (แถวหลัก) → drill-down เป็น merchant/receiver และ `project_tag`
- แสดงคอลัมน์: จำนวนรายการ, ยอด Gross, VAT, WHT, Net
- Drill-down คลิกแถว → modal list รายการละเอียด (ลิงก์ไปหน้า edit)

---

## ส่วนที่ไม่แตะ
- `TaxFieldsSection.tsx` ใช้งานต่อ (อาจ embed ลงใน Claim form ภายหลัง — เริ่มต้นใช้ input เลขตรง ๆ สำหรับ VAT/WHT จากบิลก่อน เพื่อให้สโคปไม่บานปลาย)

ผลลัพธ์: ค่ากองทุนเงินทดแทน/ค่าเดินทางทั่วไปจะลง `GENERAL` ถูกต้อง, มี VAT/WHT ครบ, และแยกดูได้ชัดในหน้าสรุปใหม่