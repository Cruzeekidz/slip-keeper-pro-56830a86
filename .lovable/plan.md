

# Auto-Match สลิปโอนเงินกับรายการเรียกเก็บ (Staff & Vendor Invoices)

## แนวคิดหลัก

เมื่ออัปโหลดสลิปโอนเงินผ่าน LINE (หรือเว็บ) → ระบบบันทึก expense ตามปกติ + **ตรวจจับอัตโนมัติว่าสลิปนี้ตรงกับ invoice ของทีมงานหรือคู่ค้าหรือไม่** → ถ้าตรง → อัปเดตสถานะเป็น `paid` + แนบสลิปให้ทันที

## สิ่งที่จะทำ

### 1. Database Migration
- เพิ่มคอลัมน์ `payment_slip_url text` และ `matched_expense_id uuid` ในตาราง `staff_invoices`
- เพิ่มคอลัมน์ `payment_slip_url text` และ `matched_expense_id uuid` ในตาราง `vendor_invoices`

### 2. ปรับ LINE Webhook (`line-webhook/index.ts`)
หลังบันทึก expense สำเร็จ → เพิ่ม logic **Auto-Match Payment**:

**สำหรับ Staff Invoices:**
- ถ้า subcategory = "Staff" และมี `staff_name` + `event_name` → ค้นหา staff_invoices ที่:
  - status = `submitted` หรือ `approved`
  - staff_profiles.staff_name หรือ nickname ตรงกับ staff_name จากสลิป
  - event_name ตรงกับ event_name จากสลิป
  - net_amount ใกล้เคียงกับ amount ในสลิป (±1 บาท เผื่อปัดเศษ)
- ถ้าเจอ → อัปเดต status = `paid`, paid_at, payment_slip_url, matched_expense_id

**สำหรับ Vendor Invoices:**
- ถ้ามี `receiver` → ค้นหา vendor_invoices ที่:
  - status = `pending` หรือ `approved`
  - net_amount ใกล้เคียงกับ amount ในสลิป
  - vendor_profiles.company_name คล้ายกับ receiver ในสลิป
- ถ้าเจอ → อัปเดต status = `paid`, paid_at, payment_slip_url, matched_expense_id

### 3. ปรับ Payment Queue (`PaymentQueue.tsx`)
- เพิ่มปุ่ม "จ่ายแล้ว" (Mark as Paid) ในแต่ละการ์ด → เปิด dialog ให้แนบสลิป
- อัปโหลดสลิปไป Storage → อัปเดต status = `paid` + `payment_slip_url` + `paid_at`
- แสดง badge "จับคู่สลิปอัตโนมัติ" สำหรับรายการที่ระบบจับคู่ให้แล้ว

### 4. ปรับ Staff Payments (`StaffPayments.tsx`)
- ปุ่ม "จ่ายแล้ว" → เปิด dialog แนบสลิปแทนการเปลี่ยนสถานะทันที
- แสดงรูปสลิปที่แนบแล้ว (ถ้ามี) ในตาราง
- เพิ่มลิงก์ไปหน้า Payment Queue สำหรับรายการ approved

### 5. LINE Reply Enhancement
- เมื่อจับคู่สลิปกับ invoice สำเร็จ → ตอบกลับ LINE เพิ่มเติม:
  `✅ จับคู่การจ่ายเงินอัตโนมัติ: [ชื่อทีมงาน/คู่ค้า] — ยอด X บาท`

## Workflow สรุป

```text
สลิปโอนเงิน (LINE/Web)
        │
        ▼
  AI วิเคราะห์สลิป
        │
        ▼
  บันทึก Expense ────────────────────┐
        │                             │
        ▼                             ▼
  Auto-Match                    เก็บสลิป
  staff_invoices               (receipts bucket)
  vendor_invoices
        │
    ┌───┴───┐
    │match  │no match
    ▼       ▼
  paid    ยังคงรอจ่าย
  +สลิป   (จับคู่ manual ภายหลัง)
```

## Technical Details

**Migration SQL:**
```sql
ALTER TABLE public.staff_invoices
  ADD COLUMN payment_slip_url text,
  ADD COLUMN matched_expense_id uuid;

ALTER TABLE public.vendor_invoices
  ADD COLUMN payment_slip_url text,
  ADD COLUMN matched_expense_id uuid;
```

**Matching Logic (in line-webhook):**
- ใช้ fuzzy match ชื่อ (lowercase + trim) เพื่อจับคู่ staff_name กับ staff_profiles
- ใช้ tolerance ±2 บาท สำหรับยอดเงิน เพื่อรองรับการปัดเศษ
- จับคู่ได้เฉพาะ 1:1 (ถ้ามีหลายรายการตรง → ข้าม ให้ admin จับคู่ manual)

**Files ที่แก้ไข:**
1. `supabase/functions/line-webhook/index.ts` — เพิ่ม auto-match logic หลัง insert expense
2. `src/pages/PaymentQueue.tsx` — เพิ่มปุ่มแนบสลิป + แสดงสถานะจับคู่
3. `src/pages/StaffPayments.tsx` — ปุ่มจ่ายแล้วต้องแนบสลิป
4. Database migration — เพิ่ม 2 คอลัมน์ใน 2 ตาราง

