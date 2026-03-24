

# แผนสร้างระบบจัดการค่าแรงสตาฟฟรีแลนซ์ + ใบสำคัญจ่าย + หัก ณ ที่จ่าย

## ภาพรวม

สร้างระบบครบวงจรสำหรับจัดการการจ่ายเงินสตาฟฟรีแลนซ์:
1. **ทะเบียนสตาฟ** — เก็บข้อมูลสตาฟ ค่าแรงรายวัน เลขบัตรประชาชน
2. **ฟอร์มเรียกเก็บเงิน** — สตาฟกรอกวันทำงาน + อีเวนท์ แล้วส่งมาทาง LINE หรือลิงก์
3. **ใบสำคัญจ่าย** — ระบบสร้าง PDF ให้เซ็นรับเงิน
4. **หัก ณ ที่จ่าย** — คำนวณ WHT 3% อัตโนมัติ พร้อมออกเอกสาร
5. **เก็บเอกสาร** — สำเนาทั้งหมดเก็บใน Storage bucket

---

## ฐานข้อมูลที่ต้องสร้าง

### ตาราง `staff_profiles` — ทะเบียนสตาฟ
```text
id, user_id, staff_name, nickname, tax_id (เลขบัตร 13 หลัก),
daily_rate, phone, line_user_id, bank_name, bank_account,
address, is_active, created_at
```

### ตาราง `staff_invoices` — ใบเรียกเก็บเงินจากสตาฟ
```text
id, user_id, staff_id, invoice_number (SI-2568-0001),
event_id, event_name, days_worked, daily_rate,
gross_amount (days × rate), wht_rate (3%), wht_amount,
net_amount (gross - wht), status (draft/submitted/approved/paid),
work_start_date, work_end_date, notes,
submitted_via (web/line), submitted_at, paid_at, created_at
```

### ตาราง `payment_vouchers` — ใบสำคัญจ่าย
```text
id, user_id, staff_invoice_id, voucher_number (PV-2568-0001),
paid_date, pdf_url, wht_cert_url, signed_url, created_at
```

---

## หน้าจอที่ต้องสร้าง

### 1. `/staff-management` — จัดการทะเบียนสตาฟ
- ตารางรายชื่อสตาฟ + ค่าแรง/วัน
- ฟอร์มเพิ่ม/แก้ไขสตาฟ (ชื่อ, เลขบัตร, บัญชีธนาคาร, ค่าแรง)
- สร้างลิงก์สำหรับสตาฟกรอกฟอร์มเรียกเก็บเงิน

### 2. `/staff-invoice` — ฟอร์มเรียกเก็บเงิน (Public)
- สตาฟเข้าผ่านลิงก์ (ไม่ต้อง login)
- กรอก: ชื่อ, อีเวนท์, วันทำงาน, ค่าแรง/วัน
- แสดงสรุป: ค่าแรงรวม, หัก 3%, ยอดสุทธิ
- กดส่ง → บันทึกเข้าระบบ (status: submitted)

### 3. `/staff-payments` — จัดการการจ่ายเงิน
- รายการใบเรียกเก็บที่ส่งมา (filter ตาม status)
- อนุมัติ → สร้างใบสำคัญจ่าย (PDF)
- สร้างหนังสือรับรองหัก ณ ที่จ่าย (PDF)
- บันทึกสถานะ: จ่ายแล้ว
- เก็บ PDF ทั้งหมดใน Storage

### 4. รองรับส่งผ่าน LINE
- สตาฟส่งข้อความ "เรียกเก็บ [ชื่อ] [วัน] [อีเวนท์]" ผ่าน LINE Bot
- Bot ตอบกลับลิงก์ฟอร์มพร้อมกรอกข้อมูลบางส่วนให้

---

## การสร้าง PDF

### ใบสำคัญจ่าย (Payment Voucher)
- ใช้ Edge Function + jsPDF หรือ pdf-lib
- ข้อมูล: เลขที่, วันที่, ชื่อผู้รับ, รายละเอียดงาน, จำนวนเงิน, ช่องเซ็นรับ

### หนังสือรับรองหัก ณ ที่จ่าย
- คำนวณ WHT 3% (บุคคลธรรมดา = ภ.ง.ด.3)
- สร้าง PDF ตามรูปแบบกรมสรรพากร
- ข้อมูล: ผู้จ่าย, ผู้รับ (เลขบัตร), ประเภทเงินได้ (ค่าจ้างทำของ 40(2)), จำนวนหัก

---

## Storage

- สร้าง bucket `documents` (private)
- โครงสร้าง: `documents/{user_id}/payment-vouchers/PV-2568-0001.pdf`
- โครงสร้าง: `documents/{user_id}/wht-certs/WHT-2568-0001.pdf`

---

## เมนูใหม่ใน Index.tsx

เพิ่มในหมวดเครื่องมือ:
- จัดการสตาฟ (`/staff-management`)
- ใบเรียกเก็บ/จ่ายเงิน (`/staff-payments`)

---

## ไฟล์ที่ต้องสร้าง/แก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| Migration SQL | สร้าง 3 ตาราง + RLS + Storage bucket |
| `src/pages/StaffManagement.tsx` | ทะเบียนสตาฟ |
| `src/pages/StaffInvoiceForm.tsx` | ฟอร์มเรียกเก็บเงิน (public) |
| `src/pages/StaffPayments.tsx` | จัดการจ่ายเงิน + สร้าง PDF |
| `supabase/functions/generate-payment-docs/index.ts` | สร้าง PDF ใบสำคัญจ่าย + WHT cert |
| `src/App.tsx` | เพิ่ม routes |
| `src/pages/Index.tsx` | เพิ่มเมนู |

