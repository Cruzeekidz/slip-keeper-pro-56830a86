## เป้าหมาย
แก้ 3 ปัญหาเรื่อง project_tag ให้ใช้งานต่อเนื่อง ไม่ต้องกรอกซ้ำ และเชื่อมโยงกับชื่ออีเวนท์อย่างเป็นธรรมชาติ

---

## 1) เพิ่มตัวกรองตาม "แท็กโปรเจกต์" ในหน้ารายการ
ไฟล์: `src/components/expense-list-real.tsx`
- เพิ่ม state `filterTag` + `Select` คล้าย `filterEvent` (อยู่ติดกัน)
- ใช้รายการ tag จาก `event_registry` รวมกับ tag ที่มีอยู่ใน `expenses` (deduped, เรียงตามตัวอักษร)
- เพิ่มเงื่อนไข `if (filterTag !== "all") filtered = filtered.filter(e => e.project_tag === filterTag)`
- เพิ่ม `filterTag` เข้า dependency ของ `useMemo` และเงื่อนไข "Reset Filters"
- (option) แสดงเป็น Combobox ค้นหาได้ ถ้า tag เกิน ~15 รายการ

---

## 2) แก้ปัญหา "เพิ่ม tag ใหม่แล้วไม่เจอครั้งถัดไป"
สาเหตุ: ฟอร์มเพิ่ม/แก้ไขโหลดรายการ tag ครั้งเดียวตอน mount จาก `expenses` + `event_registry` แต่ไม่ refresh และไม่บันทึกลง registry เมื่อพิมพ์ tag ใหม่

แนวทาง: **Auto-register** เมื่อมีการบันทึก expense ที่มี `project_tag` ใหม่
- ในฟังก์ชัน save ของ `expense-upload.tsx` และ `expense-edit-dialog.tsx`:
  - หลัง insert/update สำเร็จ ถ้า `project_tag` ไม่มีใน `event_registry` ของผู้ใช้ → upsert เข้า `event_registry` (ใช้ `event_name` เป็นชื่อหากกรอกไว้, ไม่งั้น fallback เป็น tag)
- รีเฟรชรายการ tag ในฟอร์มแบบ realtime: subscribe `event_registry` หรือ refetch ตอนเปิด Combobox dropdown (`onOpenChange`)
- หน้า list ใช้ React Query → invalidate `['event-registry']` หลัง save

ผลลัพธ์: tag ที่พิมพ์ครั้งแรกจะถูกบันทึกเป็น registry อัตโนมัติ ครั้งถัดไปจะอยู่ใน dropdown ทันที

---

## 3) รวม "แท็กโปรเจกต์" กับ "ชื่ออีเวนท์" ให้เป็นเรื่องเดียวกัน

**บริบทเดิม:**
- `event_name` = ชื่อที่อ่านได้ เช่น "Rockstar 3 ครั้งที่ 5"
- `project_tag` = code สำหรับจัดกลุ่ม/รายงาน เช่น `EVT-Rockstar3`
- `event_registry` ผูกทั้งสองไว้แล้ว (1 record = 1 ชื่อ + 1 tag + aliases + วันที่ + readygo_event_id)

**แนวทางใหม่ (single picker):**
- ในฟอร์ม `expense-edit-dialog.tsx` และ `expense-upload.tsx`:
  - เปลี่ยนจาก 2 ช่อง (`event_name` + `project_tag`) → **Combobox เดียว "อีเวนท์/โปรเจกต์"**
  - Options ดึงจาก `event_registry` แสดง "ชื่ออีเวนท์ — TAG (วันที่)"
  - เลือก 1 ครั้ง → set ทั้ง `event_name` และ `project_tag` ให้อัตโนมัติ
  - พิมพ์ใหม่ที่ไม่มี → เปิด dialog เล็ก "สร้างอีเวนท์ใหม่" (ขอชื่อ + tag + วันที่) → insert event_registry → เลือกอัตโนมัติ
- ฟิลด์ `project_tag` และ `event_name` ใน DB ยังคงอยู่เหมือนเดิม (ไม่ break รายงาน/บัญชีที่มีอยู่)
- กลุ่มที่ไม่ใช่ EVENT (PROGRAM/ENTITY) → ใช้ Combobox tag เดี่ยวแบบเดิม (ไม่บังคับ event_name)

**ที่อื่นๆ ที่ได้ประโยชน์ทันที:**
- หน้า list filter "อีเวนท์" และ "แท็ก" จะ sync กัน (เลือก event → tag ขึ้นอัตโนมัติ ในฟอร์ม)
- LINE bot OCR / Review queue ใช้ logic เดียวกัน

---

## ส่วนที่ไม่แตะ
- Schema `expenses`/`event_registry` ไม่เปลี่ยน
- หน้า EventManagement ใช้สร้าง/แก้ event ตามเดิม (เพิ่มแค่ entry point จาก dialog ใหม่)
- รายงาน Dashboard / EventPnL ใช้ project_tag/event_name ตามเดิม

---

## ผลลัพธ์
1. กรอง tag ได้ในหน้ารายการ
2. tag ใหม่บันทึกอัตโนมัติเข้า registry → ใช้ครั้งถัดไปได้ทันที
3. เลือก "อีเวนท์/โปรเจกต์" ครั้งเดียว → set event_name + tag พร้อมกัน ไม่กรอกซ้ำ
