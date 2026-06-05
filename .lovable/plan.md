# แผน: ยกระดับ LINE Bot ให้ใช้งานง่ายขึ้น

แบ่งเป็น 3 ฟีเจอร์หลัก ทุกฟีเจอร์ทำงานในไฟล์ `supabase/functions/line-webhook/index.ts` เป็นหลัก

---

## 1. Auto-link เมื่อแอดเฟรนด์ (Follow event + ทุกข้อความ)

**Flow:**
- เมื่อมี `event.type === "follow"` หรือผู้ใช้ส่งข้อความแรก (ยังไม่มีใน `line_user_mappings`):
  1. ลองเรียก `link_staff_line_id` และ `link_vendor_line_id` ด้วย LINE profile name (เทียบ staff_name/nickname/company_name แบบ ILIKE) เผื่อ match อัตโนมัติ
  2. ส่ง Flex Message ต้อนรับ พร้อม 2 ปุ่ม:
     - **"ผูกบัญชีของฉัน"** → ส่ง URL `/link-line` (รหัส 6 หลักวิธีเดิม)
     - **"ฉันเป็นทีมงาน/คู่ค้าใหม่"** → เริ่ม conversation เก็บ ชื่อ-เบอร์-เลขบัตร แล้วสร้าง `staff_profiles` หรือ `vendor_profiles` ใหม่อัตโนมัติ
- บันทึกใน `line_user_roles` เป็น `member` (มีอยู่แล้ว) และเพิ่มสถานะ `pending_link` ถ้ายังไม่ได้ผูก

**ผลลัพธ์:** ทุกคนที่แอดเข้ามาจะถูกชวนผูกบัญชีทันที โดยไม่ต้องให้ admin ทำมือ

---

## 2. เก็บบัตรประชาชนอัตโนมัติ + OCR

**Trigger:** เมื่อผู้ใช้ที่ผูกบัญชีแล้วส่งรูป และ profile ของเขายังไม่มี `id_card_url`:
- บอทจะส่งข้อความถามก่อน: *"นี่คือรูปบัตรประชาชนของคุณใช่ไหม?"* พร้อม Quick Reply: `ใช่` / `ไม่ใช่ เป็นใบเสร็จ`
- ถ้ายืนยัน "ใช่":
  1. อัปโหลดเข้า `documents` bucket path: `id-cards/{owner}/{profile_id}/{timestamp}.jpg` (ตามรูปแบบใน document-storage-architecture)
  2. เรียก Lovable AI (`google/gemini-2.5-flash`) ทำ OCR ดึง: เลขบัตร 13 หลัก, ชื่อ-สกุล, วันหมดอายุ
  3. อัปเดต `staff_profiles` / `vendor_profiles`: `id_card_url`, `id_card_number`, `id_card_verified_at`
  4. แจ้งกลับ: *"บันทึกบัตรประชาชนแล้ว ✅ เลข: x-xxxx-xxxxx-xx-x"*

**Schema:** ตรวจสอบว่า `staff_profiles` / `vendor_profiles` มีคอลัมน์ `id_card_url`, `id_card_number` อยู่แล้วหรือไม่ ถ้ายังไม่มีจะสร้าง migration เพิ่ม

**ตัวกันพลาด:** ถ้า OCR เจอเลข 13 หลักแต่ user ตอบ "ไม่ใช่" → fallback เข้า flow ใบเสร็จเดิม

---

## 3. แจ้งค่าใช้จ่ายแบบ Conversational (AI + Quick Reply)

**Trigger:** ผู้ใช้ที่ผูก staff_profile แล้ว พิมพ์ข้อความที่เข้าข่ายค่าใช้จ่าย (เช่น "ค่าแท็กซี่ 250", "ซื้อน้ำให้ทีม 180") หรือส่งรูปบิล

**Flow ใหม่ (state machine ใน table ใหม่ `line_conversation_state`):**

```text
[ผู้ใช้พิมพ์/ส่งบิล]
   ↓
[AI parse: amount, description, hints]
   ↓
ถาม field ที่ขาดทีละข้อ พร้อม Quick Reply:
  1. "เป็นค่าใช้จ่ายของ event ไหน?" 
     → Quick Reply: 5 events ล่าสุดจาก event_registry + "อื่นๆ (พิมพ์)"
  2. "หมวดค่าใช้จ่าย?"
     → Quick Reply: หมวดที่ใช้บ่อย 5 อัน + "อื่นๆ"
  3. "ตำแหน่ง/สถานที่?" (ถ้า event เป็นแบบมี location)
     → Quick Reply: location จาก event ที่เลือก
  4. (ถ้าส่งบิล) "วันที่บนบิลคือ? ยอด? เลข Tax?" → AI พยายามเติมก่อน ถามเฉพาะที่ขาด
   ↓
[สรุป Flex Message: ยืนยัน/แก้ไข]
   ↓
INSERT เข้า staff_expense_claims (เป็น draft) → admin review ต่อใน app
```

**Schema ใหม่:** ตาราง `line_conversation_state`
- `line_user_id` (PK)
- `state` (`awaiting_event` | `awaiting_category` | `awaiting_location` | `awaiting_confirm`)
- `draft_data` (jsonb)
- `expires_at` (10 นาที auto-clear)

**สิทธิ์การใช้งาน:**
- ทั้ง staff (`staff_profiles.line_user_id`) และ vendor (`vendor_profiles.line_user_id`)
- staff → INSERT เข้า `staff_expense_claims`
- vendor → INSERT เข้า `vendor_invoices`
- คนที่ยังไม่ได้ผูก → บอทขอให้ผูกก่อน

---

## รายละเอียดเชิงเทคนิค

**ไฟล์ที่แก้:**
- `supabase/functions/line-webhook/index.ts` — เพิ่ม follow handler, ID card OCR flow, conversational state machine, Quick Reply builders
- `supabase/functions/_shared/line-flex.ts` (ใหม่) — แยก Flex Message templates ออกจาก webhook (Welcome, Confirm Expense, Confirm ID Card)
- `supabase/functions/_shared/conversation-state.ts` (ใหม่) — helper อ่าน/เขียน `line_conversation_state`

**Migration:**
1. ตาราง `line_conversation_state` (พร้อม GRANT + RLS service_role only)
2. เพิ่มคอลัมน์ `id_card_url`, `id_card_number`, `id_card_verified_at` ใน `staff_profiles` และ `vendor_profiles` (ถ้ายังไม่มี — จะเช็คก่อน)

**AI:** ใช้ `google/gemini-2.5-flash` ผ่าน Lovable AI Gateway (LOVABLE_API_KEY มีอยู่แล้ว) สำหรับ:
- OCR บัตรประชาชน
- Parse ข้อความค่าใช้จ่ายให้เป็น structured (เพิ่มจาก `parseCashExpenseWithAI` เดิม)

**LINE features ที่จะใช้:**
- Quick Reply (พร้อม `text` action)
- Flex Message (Confirm card)
- `follow` event handler

**Memory updates หลังเสร็จ:**
- `mem://integrations/line-bot-architecture` — เพิ่ม conversational flow + ID card OCR
- `mem://features/line-auto-link` — เพิ่ม follow-time auto-match
- เพิ่ม `mem://features/line-conversational-expense` ใหม่
