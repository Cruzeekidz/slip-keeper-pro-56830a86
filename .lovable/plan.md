

## Phase 1: Reopen Paid Invoice + Audit Log

### ข้อมูลที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)
- ✅ ตาราง `staff_invoice_audit_log` (สร้างแล้ว มี RLS admin/super_admin/accountant)
- ✅ Component `src/components/staff/ReopenInvoiceDialog.tsx` (เขียนแล้วครบ logic)
- ✅ Hook `useUserRole` (มี isAdmin, isSuperAdmin)
- ✅ ตาราง `deleted_expenses` สำหรับ recovery

### สิ่งที่ต้องทำ (Phase 1 เน้นเชื่อมต่อ + log ให้ครบ)

**1. เชื่อม `ReopenInvoiceDialog` เข้า `StaffPayments.tsx`**
- เพิ่ม state `reopenTarget`
- บนแถวใบที่ `status === 'paid'` → แสดงปุ่ม 🔓 "ย้อนกลับ" (เฉพาะ `isAdmin` หรือ `isSuperAdmin`)
- กดปุ่ม → set `reopenTarget` → เปิด dialog
- หลัง reopen สำเร็จ → invalidate queries (มีใน dialog แล้ว)

**2. เพิ่ม Audit Log ใน action อื่นของ invoice**
- `editInvoiceMutation` → log `action='edit'` พร้อม old_data/new_data (gross/wht/net/days/rate)
- `deleteInvoiceMutation` → log `action='delete'` พร้อม old_data
- `markAsPaidMutation` (จ่ายซ้ำหลัง reopen) → log `action='repay'`

**3. ปุ่ม "ประวัติการแก้ไข" (Inline Audit Viewer)**
- บนแถวที่มี audit log อย่างน้อย 1 row → แสดง icon History
- กด → เปิด dialog `InvoiceAuditHistoryDialog` (component ใหม่):
  - Query `staff_invoice_audit_log` where `invoice_id = ...` order by created_at desc
  - แสดง timeline: action (badge สี), reason, changed_by_email, created_at, diff old→new ย่อ

**4. ปรับ ReopenInvoiceDialog เล็กน้อย**
- ตรวจ guard: ถ้าไม่ใช่ admin → ไม่ให้เปิด (double-check ฝั่ง client)
- Toast Thai messages ให้ชัด

### ไฟล์ที่แก้/สร้าง
- `src/pages/StaffPayments.tsx` — เพิ่มปุ่ม Reopen + History, log ใน mutations
- `src/components/staff/InvoiceAuditHistoryDialog.tsx` (ใหม่) — viewer
- `src/components/staff/ReopenInvoiceDialog.tsx` — minor polish

### ทดสอบหลังเสร็จ
1. กดย้อนใบ paid 1 ใบ → ตรวจ status='submitted', expense BUSINESS+WHT ถูกย้ายไป deleted_expenses
2. แก้ไขใบเดิม → เปิดประวัติ → เห็น 2 entries (reopen + edit)
3. จ่ายใหม่ → เห็น entry repay เพิ่ม
4. ตรวจ user role=user → ไม่เห็นปุ่มย้อนกลับ

### To-Do List (Phase 2-6 ที่จะตามมา)
จะถูกบันทึกเป็น task list หลังเริ่ม implement:
- Phase 2: Cash Advance + LINE memo `ทดรอง` + Import legacy
- Phase 3: Payment Voucher (auto จ่ายสตาฟ) + Payment Certificate (3 ลายเซ็น)
- Phase 4: Credit Card + Statement reconcile
- Phase 5: Accountant Export ZIP+Excel
- Phase 6: LINE Conversational Bot (text intents)

แต่ละ Phase จะคุยยืนยัน scope ก่อนเริ่ม ไม่ commit ล่วงหน้า

