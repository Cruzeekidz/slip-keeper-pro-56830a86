

## ปัญหา
ปัจจุบันใบที่ status = `paid` ถูกล็อก แก้ไขไม่ได้เลย → ต้อง manual reset ใน DB ทุกครั้ง ไม่สะดวกและไม่มี audit trail

## แผนแก้ไข — Reopen Paid Invoice พร้อม Audit Log

### 1. Database (migration)
สร้างตาราง `staff_invoice_audit_log`:
- `invoice_id`, `action` (reopen/edit/repay/delete), `old_status`, `new_status`
- `changed_by` (auth.uid()), `reason` (text), `old_data` jsonb, `new_data` jsonb
- `created_at`
- RLS: เฉพาะ admin/super_admin ดู+เขียนได้ (ผ่าน `has_role`)

### 2. UI — เพิ่มปุ่ม "ย้อนกลับ" บนใบ paid (`StaffPayments.tsx`)
- บนแถวใบที่ `status === 'paid'` → แสดงปุ่ม 🔓 **"ย้อนกลับเพื่อแก้ไข"** (เฉพาะ admin/super_admin เห็น — ใช้ `useUserRole`)
- กดแล้วเปิด `ReopenInvoiceDialog`:
  - แสดง warning: "การย้อนกลับจะลบบันทึกค่าใช้จ่ายและภาษีค้างจ่ายที่สร้างไว้"
  - **กรอกเหตุผล** (required, min 10 ตัวอักษร) — เช่น "ลืมระบุ WHT 3%"
  - **ยืนยันด้วยรหัส 4 หลัก** (PIN จาก env หรือ confirm-typing คำว่า "ยืนยัน")
  - ปุ่ม "ยืนยันย้อนกลับ"

### 3. Logic การ Reopen
เมื่อกดยืนยัน:
1. หา expenses ที่ link กับใบนี้ (ผ่าน `receipt_url = payment_slip_url` + `staff_name` + `expense_date = paid_at`) — ทั้ง Gross expense + WHT liability expense
2. ลบ expenses ทั้ง 2 รายการ (ย้ายไป `deleted_expenses` ตามระบบเดิม)
3. Update `staff_invoices`: status → `submitted`, paid_at → null, payment_slip_url → null, matched_expense_id → null
4. Insert `staff_invoice_audit_log`: action='reopen', old_status='paid', reason=...
5. Toast: "ย้อนกลับสำเร็จ — สามารถแก้ไขและจ่ายใหม่ได้"

### 4. Audit Log Viewer
- เพิ่มปุ่ม "ประวัติการแก้ไข" (icon History) บนใบที่เคย reopen — แสดง dialog ลิสต์ log
- หรือหน้าใหม่ `/audit-log` (รวม log ทุกรายการ) — ตัดสินใจเอาแบบ inline ก่อน เพื่อไม่ over-engineer

### 5. Log ครอบคลุม actions อื่นด้วย
- `edit` — เมื่อแก้ไขผ่าน editInvoiceMutation (เก็บ old/new amounts)
- `repay` — เมื่อจ่ายซ้ำหลัง reopen
- `delete` — เมื่อลบใบ

### Security
- ปุ่ม Reopen เฉพาะ `admin` หรือ `super_admin`
- RLS audit_log: insert ได้ทุก authenticated user (ผ่าน trigger), select เฉพาะ admin
- PIN ใช้ค่า fixed `2024` หรือให้พิมพ์ `ยืนยัน` (เลือกแบบหลังเพื่อไม่ต้องจัดการ secret)

### ไฟล์ที่แก้
- `supabase/migrations/...` — สร้าง `staff_invoice_audit_log` + RLS
- `src/pages/StaffPayments.tsx` — เพิ่มปุ่ม Reopen + Dialog + ลบใน reopen logic + log call ใน edit mutation
- `src/components/staff/ReopenInvoiceDialog.tsx` (ใหม่) — แยก dialog ออกมา

ไม่ต้องแก้ `PaymentQueue.tsx` (ใบ paid ไม่โผล่ในนั้นอยู่แล้ว)

