## เป้าหมาย
ส่ง LINE Push Message สั้นๆ ไปยัง LINE User ID ของแอดมิน เมื่อมีเหตุการณ์สำคัญในระบบ เพื่อไม่ต้องเปิด LINE OA: Cruzee Finance ค้างไว้

## เหตุการณ์ที่จะแจ้ง (ครอบคลุมทั้งหมด)
1. **Staff/Vendor ใหม่ผูก LINE สำเร็จ** — เมื่อ `link_staff_line_id` / `link_vendor_line_id` คืนสถานะ `linked`
2. **Vendor ส่งบิลใหม่** — เมื่อ insert ลง `vendor_invoices` จาก LINE portal/LIFF
3. **Staff แจ้งค่าใช้จ่าย/เบิกเงิน** — เมื่อ insert ลง `staff_expense_claims` หรือ `staff_invoices` ที่ status = `submitted`

## รูปแบบข้อความ (สั้น กระชับ)
```
🆕 [Vendor] บริษัท ABC ผูก LINE แล้ว
```
```
🧾 [Vendor Bill] บริษัท ABC ส่งบิล ฿12,500 — Inv #INV-001
แตะดู: <deep link>
```
```
💰 [Staff Claim] สมชาย (ชื่อเล่น) เบิก ฿3,200
แตะดู: <deep link>
```
แต่ละข้อความเป็น text เดียว มี deep link ไปยังหน้าจัดการที่เกี่ยวข้องในแอด (Review Queue / Vendor Bills / Staff Payments)

## สถาปัตยกรรม
1. **Setting แอดมิน LINE User ID**
   - เพิ่ม column `admin_notify_line_user_id` ใน `user_roles` (สำหรับ role = admin/super_admin) หรือสร้าง table `admin_notification_settings(user_id, line_user_id, enabled_events jsonb)` เพื่อรองรับหลายแอดมินและ toggle ราย event
   - หน้า Settings ใหม่: `/admin-notifications` — กรอก LINE User ID + toggle event ที่ต้องการ + ปุ่ม "Test Push"
2. **Edge function ใหม่: `notify-admin-line`**
   - Input: `{ owner: uuid, event_type: string, payload: {...} }`
   - ดึง LINE User ID ของ admin จาก settings → ถ้า enabled สำหรับ event นี้ → Push ผ่าน LINE Messaging API
   - ใช้ `LINE_CHANNEL_ACCESS_TOKEN` ที่มีอยู่แล้ว
3. **จุดที่เรียก notify-admin-line**
   - `line-webhook` (หลัง link สำเร็จ) → `event_type: 'link_success'`
   - `line-webhook` / LIFF portal endpoint ที่ insert `vendor_invoices` → `event_type: 'vendor_bill_new'`
   - Endpoint ที่ insert `staff_expense_claims` / `staff_invoices` → `event_type: 'staff_claim_new'`
   - เรียกแบบ fire-and-forget (await ไม่ block flow หลัก, log error ถ้า fail)

## เทคนิคที่ใช้
- ตาราง `admin_notification_settings`:
  - `user_id` (admin UUID, PK)
  - `line_user_id` text
  - `notify_link_success` boolean default true
  - `notify_vendor_bill` boolean default true
  - `notify_staff_claim` boolean default true
  - RLS: เจ้าของแก้/อ่านได้เอง, service_role ใช้ใน edge function
- ใช้ LINE Push API: `POST https://api.line.me/v2/bot/message/push`

## เฟส
- **A:** ตาราง settings + หน้า `/admin-notifications` + edge function `notify-admin-line` + ปุ่มทดสอบ
- **B:** เชื่อม trigger ทั้ง 3 จุด (link / vendor bill / staff claim)
- **C:** เพิ่ม deep link ในข้อความ + ทดสอบจริง

## ข้อสังเกต
- ถ้ายังไม่ได้กรอก LINE User ID ของแอดมิน → edge function ข้าม push เงียบๆ ไม่ error
- ในอนาคตขยายเพิ่ม event อื่นได้ง่าย (เช่น OCR fail, สลิปซ้ำ) โดยเพิ่ม column toggle
- LINE User ID ของแอดมินหาได้จาก LINE Developer Console (Your user ID) หรือให้บอท reply ตอนพิมพ์ `/myid`
