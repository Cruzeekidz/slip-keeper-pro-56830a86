## ปัญหา

ทีมงาน 18 คนในระบบ **ไม่มี LINE ID ผูกเลย** เพราะ:

1. ฟอร์ม `StaffRegistrationForm` / `VendorRegistrationForm` ดึง `lineUserId` จาก LIFF อัตโนมัติได้อยู่แล้ว ✅
2. **แต่** ถ้าทีมงานเก่ามากรอกฟอร์มซ้ำ → ระบบ **insert profile ใหม่** กลายเป็นข้อมูลซ้ำ แทนที่จะ "ผูก LINE ID เข้า profile เดิม"
3. ไม่มีหน้า/ปุ่ม "แค่ผูก LINE" สำหรับทีมงานเก่าที่ข้อมูลครบแล้ว ต้องการแค่เชื่อม LINE

## เป้าหมาย

ให้ทีมงาน/คู่ค้ากด Rich Menu ครั้งเดียวก็ผูก LINE ได้อัตโนมัติ — โดยไม่ต้องกรอกรหัส 6 หลัก ไม่ต้องสร้าง profile ซ้ำ

---

## แผนการทำงาน

### 1. เปลี่ยน Logic ฟอร์มลงทะเบียน — รองรับ "Upsert by LINE ID + Phone/Tax ID"

**StaffRegistrationForm**
- ก่อน insert ตรวจหา profile ที่ match กับเจ้าของ (`user_id = ownerId`) ด้วยลำดับ:
  1. `line_user_id = lineUserId` (เคยผูกแล้ว → update)
  2. `phone = form.phone` AND `line_user_id IS NULL` (ทีมงานเก่า → ผูก LINE)
  3. `tax_id = form.tax_id` AND `tax_id IS NOT NULL` AND `line_user_id IS NULL` (กรณีไม่มีเบอร์ตรงกัน)
- ถ้าเจอ → `update` profile เดิม (เติม `line_user_id` + ฟิลด์ที่ยังว่าง) แล้วแสดงข้อความ "เชื่อม LINE สำเร็จ — เป็นทีมงานเดิมของระบบ"
- ถ้าไม่เจอ → `insert` profile ใหม่เหมือนเดิม

**VendorRegistrationForm** — ใช้ logic เดียวกัน match ด้วย `tax_id` หรือ `phone`

### 2. เพิ่มหน้าใหม่ `/portal/quick-link` — สำหรับทีมงานเก่าที่อยากแค่ผูก LINE

หน้านี้ออกแบบให้กรอก **ขั้นต่ำที่สุด** (เบอร์โทรอย่างเดียว):
- ถ้าเปิดจาก LIFF → ดึง `lineUserId` อัตโนมัติ
- ฟอร์มมีแค่ช่อง "เบอร์โทรของคุณ" + ปุ่ม "เชื่อม LINE"
- กดปุ่ม → ค้นหา `staff_profiles` (และ `vendor_profiles`) ที่ `user_id = ownerId` AND `phone = X` AND `line_user_id IS NULL`
  - เจอ 1 รายการ → update `line_user_id` → แสดง "✓ เชื่อมสำเร็จ คุณคือ {staff_name}"
  - เจอหลายรายการ → แสดง dropdown ให้เลือกชื่อตัวเอง แล้วยืนยัน
  - ไม่เจอ → แสดงปุ่มลิงก์ไปหน้า "ลงทะเบียนใหม่"

### 3. เพิ่มปุ่มใน Rich Menu (LINE Developers Console) — งานของ user

เพิ่มปุ่มใหม่ชื่อ **"เชื่อม LINE กับโปรไฟล์"** ที่ลิงก์ไปยัง LIFF URL ของ `/portal/quick-link?owner={ADMIN_UUID}`

(แผนนี้จะเตรียม URL ให้พร้อม ส่วนการตั้งค่า Rich Menu user ทำเองใน LINE Console — ไม่ต้องเขียนโค้ด)

### 4. แสดงสถานะ "ผูก LINE แล้ว/ยังไม่ผูก" ในหน้า Admin

ในหน้า `/staff-management` และ `/vendors`:
- เพิ่ม Badge สีเขียว "🟢 LINE Linked" หรือสีเทา "⚪ ยังไม่ผูก LINE" ข้างชื่อ
- เพิ่มปุ่ม **"คัดลอกลิงก์เชื่อม LINE"** สำหรับคนที่ยังไม่ผูก (admin ส่งให้ทีมงานทาง LINE 1-on-1)

### 5. ลบ/ลดความสำคัญของ flow `/link-line` (รหัส 6 หลัก)

- คงไว้เป็น fallback แต่ไม่แนะนำในข้อความหลัก
- เปลี่ยน toast ใน `/staff-payments` (ตอนเจอทีมงานไม่มี LINE ID) → ให้คัดลอก **ลิงก์ Quick-Link** แทนคำสั่ง `/link-line`

---

## รายละเอียดทางเทคนิค

**ไฟล์ที่จะแก้:**
- `src/components/portal/StaffRegistrationForm.tsx` — เพิ่ม logic upsert
- `src/components/portal/VendorRegistrationForm.tsx` — เพิ่ม logic upsert
- `src/components/portal/QuickLinkForm.tsx` *(ใหม่)* — ฟอร์มเชื่อม LINE แบบ minimal
- `src/pages/PublicPortal.tsx` — เพิ่ม route `view=quick-link`
- `src/pages/StaffManagement.tsx` — เพิ่ม Badge + ปุ่มคัดลอกลิงก์
- `src/pages/Vendors.tsx` — เพิ่ม Badge + ปุ่มคัดลอกลิงก์
- `src/pages/StaffPayments.tsx` — เปลี่ยน toast แนะนำลิงก์ Quick-Link

**Database:** ไม่ต้องเปลี่ยน schema — ใช้ฟิลด์ `line_user_id`, `phone`, `tax_id` ที่มีอยู่แล้ว

**Security:** RLS policy `Anon can insert staff profiles with valid owner` ปัจจุบันอนุญาตให้ insert เท่านั้น → ต้อง**เพิ่ม policy ใหม่** ให้ anon สามารถ `UPDATE` ได้ **เฉพาะ** เมื่อ:
- `user_id = ownerId` (admin ที่ระบุใน URL)
- `is_valid_user_id(user_id) = true`
- เปลี่ยนได้เฉพาะฟิลด์ `line_user_id` (ผ่าน column-level constraint หรือ trigger ตรวจว่าฟิลด์อื่นไม่เปลี่ยน)
- WITH CHECK: `line_user_id IS NOT NULL` (กันการล้าง LINE ID ของคนอื่น)

**LIFF:** ใช้ `useLiff()` hook เดิม — ไม่ต้องเปลี่ยน

---

## ผลลัพธ์ที่ user จะเห็น

- **ทีมงานใหม่:** เปิด Rich Menu → กรอกฟอร์มลงทะเบียน → ผูก LINE อัตโนมัติ ✅
- **ทีมงานเก่า 18 คน:** เปิด Rich Menu → กดปุ่ม "เชื่อม LINE" → กรอกเบอร์โทร → ผูกสำเร็จใน 5 วินาที ✅
- **Admin:** เห็นชัดเจนว่าใครยังไม่ผูก LINE และคัดลอกลิงก์ส่งได้ใน 1 คลิก
- **ไม่ต้อง** ใช้รหัส 6 หลักอีกต่อไปสำหรับการใช้งานปกติ
