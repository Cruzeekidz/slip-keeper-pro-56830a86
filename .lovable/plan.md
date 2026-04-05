

# การเชื่อมโยงสลิป กับ ใบเสร็จ/ใบกำกับภาษี — ออกแบบให้ไม่ซ้ำซ้อน

## สถานะปัจจุบัน: ข้อมูลแยก 2 ชั้น

ระบบปัจจุบันมีโครงสร้างที่ดีอยู่แล้ว:

```text
ชั้นที่ 1: expenses (สลิปเงินโอน = หลักฐานการจ่าย)
  └── เก็บ: ยอดเงิน, วันที่โอน, สลิปรูป, ผู้รับ, transaction_id

ชั้นที่ 2: vendor_invoices (บิลจากคู่ค้า = เอกสารเรียกเก็บเงิน)
  └── มี matched_expense_id → ชี้กลับไปที่ expenses
```

**ข้อมูลไม่ซ้ำ** เพราะแต่ละตารางเก็บคนละหน้าที่:
- `expenses` = "จ่ายเงินไปเท่าไหร่ เมื่อไหร่ โอนให้ใคร" (หลักฐานการเงิน)
- `vendor_invoices` / ใบเสร็จ = "เอกสารรับรองจากฝั่งผู้ขาย" (หลักฐานทางภาษี)

## แผนเพิ่มระบบใบเสร็จ/ใบกำกับภาษี

### หลักการ: ไม่สร้างตารางใหม่ — ขยาย `vendor_invoices` ที่มีอยู่

ตาราง `vendor_invoices` มีโครงสร้างที่รองรับอยู่แล้ว (amount, vat_amount, file_url, ocr_data, matched_expense_id) เพียงเพิ่มคอลัมน์เล็กน้อย:

```text
vendor_invoices (เพิ่มคอลัมน์)
  + document_type: 'invoice' | 'receipt' | 'tax_invoice' | 'substitute_receipt'
  + tax_id: text           -- เลขผู้เสียภาษีของผู้ออกเอกสาร
  + is_formal: boolean     -- เป็นเอกสารทางการหรือไม่
```

### Flow การใช้งาน: ไม่ซ้ำซ้อน

```text
1. ส่งสลิปผ่าน LINE
   → บันทึกเป็น expenses (สลิปเงินโอน)
   → เก็บรูปสลิปใน Storage

2. ได้รับใบเสร็จ/ใบกำกับภาษีจากร้าน
   → อัพโหลดเป็น vendor_invoices (document_type = 'receipt' หรือ 'tax_invoice')
   → เก็บรูปใบเสร็จใน Storage

3. ผูกข้อมูล (Matching)
   → vendor_invoices.matched_expense_id = expenses.id
   → 1 สลิป สามารถมีใบเสร็จ 1+ ใบ ผูกกัน
   → แสดง badge "มีใบเสร็จแล้ว" ในรายการสลิป
```

### ตัวอย่างจริง

| ขั้นตอน | ตาราง | ข้อมูล |
|---------|-------|--------|
| จ่ายค่าเช่าบูธ 5,000 บาท | `expenses` | สลิปโอนเงิน, transaction_id |
| ได้รับใบเสร็จจากห้าง | `vendor_invoices` | ใบเสร็จ PDF, matched_expense_id → expenses.id |
| ได้ใบกำกับภาษี VAT | `vendor_invoices` | ใบกำกับภาษี, tax_id, vat_amount |

### สิ่งที่ต้องทำ

1. **Migration**: เพิ่ม 3 คอลัมน์ใน `vendor_invoices` (document_type, tax_id, is_formal) + default value
2. **UI หน้าจัดการใบเสร็จ**: เพิ่มแท็บ "ใบเสร็จ/ใบกำกับภาษี" ในหน้า Vendor Management หรือสร้างหน้าใหม่
3. **ปุ่มผูกข้อมูล**: ในรายการ expenses เพิ่มปุ่ม "แนบใบเสร็จ" → อัพโหลด + สร้าง vendor_invoices พร้อม matched_expense_id
4. **OCR**: ปรับ analyze-receipt ให้ดึง tax_id และ VAT จากใบกำกับภาษี
5. **Badge แสดงสถานะ**: ในรายการ expenses แสดงว่า "มีใบเสร็จแล้ว" / "ยังไม่มีใบเสร็จ"

### ทำไมไม่ซ้ำซ้อน

- **expenses** = บันทึกการจ่ายเงิน (Cashflow)
- **vendor_invoices** = เอกสารรับรอง (Tax compliance)
- ผูกกันด้วย `matched_expense_id` แบบ many-to-one
- ไม่มีการบันทึกยอดเงินซ้ำในการคำนวณ P&L (ใช้แค่ expenses)

