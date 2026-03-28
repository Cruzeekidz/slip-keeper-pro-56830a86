

## แผนปรับโครงสร้างระบบภาษีหัก ณ ที่จ่าย (WHT) — ✅ ดำเนินการแล้ว

### สิ่งที่ดำเนินการเสร็จ

1. **สร้างตาราง DB ใหม่**: `wht_remittance_batches` + `wht_remittance_items` + เพิ่ม `settled_batch_id` ใน `expenses`
2. **ปรับ WhtReport.tsx เหลือ 2 แท็บ**: รายงาน ภ.ง.ด. (inline FA link + LINE ส่ง) + นำส่งสรรพากร (Batch management)
3. **ลบปุ่ม Printer / สร้างเอกสาร WHT** — ใช้ FlowAccount แทน
4. **ลบปุ่ม "บันทึกรายการ WHT"** — WHT ถูกสร้างอัตโนมัติเมื่อจ่ายเงิน
5. **ลบ route `/wht-certificate`** จาก App.tsx
6. **แท็บเครดิต WHT (หน้าหลัก)** — แสดงเฉพาะ unsettled + ยอดนำส่งแล้ว
7. **Flow จ่ายเงินสรรพากร**: สร้าง expense เงินสดจ่าย + mark WHT settled

### หลักการบัญชี

- WHT = Liability (ค้างจ่าย) จนกว่าจะนำส่ง
- เมื่อนำส่ง: Dr. WHT Payable / Cr. เงินสด
- P&L ยังคำนวณ WHT เป็นส่วนหนึ่งของ Gross pay (ไม่เปลี่ยน)
