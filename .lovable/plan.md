## สรุป 3 เรื่อง — ขอคุยก่อนสร้าง

### 1️⃣ ลบรายการ ID `d8301a6f...` แต่เก็บรูปบัตร ปชช.

ตรวจฐานข้อมูลแล้ว — รายการนี้คือ **บัตรประชาชนของคุณ Patchanee Kaenkham** ที่ OCR อ่านเข้ามาเป็น expense (amount=0, ปี 2018):

- ไฟล์อยู่ที่: `receipts/line/U975e1cfdc63b302979788c8f95d11519/PERSONAL/2018/08/1775795179838_...jpg`

**แผน:**

1. คัดลอกไฟล์รูปจาก bucket `receipts` ไปยัง bucket `documents` ที่ path `staff-id-cards/{staff_id หรือ unknown}/Patchanee_Kaenkham_2018-08-16.jpg` (เพื่อให้คลังเอกสารเห็น)
2. ลบ row จากตาราง `expenses`
3. ตรวจว่ามี `staff_profiles` ของ "Patchanee Kaenkham" แล้วหรือยัง — ถ้ามี ให้ update `id_card_url` ชี้ไปยังไฟล์ใหม่ใน documents bucket

**❓ ขอคำตอบ:** คุณ Patchanee เป็นทีมงานในระบบหรือยัง? ถ้ายัง อยากให้ผม:

- (a) สร้าง staff_profile ใหม่ให้พร้อม id_card_url

---

### 2️⃣ บันทึกบิล/ใบกำกับภาษี + จับคู่กับสลิปที่จ่ายไปแล้ว (Reverse Workflow)

**ปัญหาปัจจุบัน:**

- LINE Bot รับทุกรูปเป็น `expenses` (สลิป) เท่านั้น — ไม่แยกบิล/ใบกำกับภาษี
- คู่ค้าหลายคนไม่ใช้ portal — เราโอนเงินก่อน แล้วค่อยมาบันทึกบิลย้อนหลัง
- ไม่มี flow สร้างใบบันทึกจ่าย + WHT จากรายการ expense ที่มีอยู่แล้ว

**ข้อเสนอ — Reverse Match Workflow (คุยก่อนสร้าง):**

**A. ในหน้ารายการเคลื่อนไหว (`/expense-list-real`)** เพิ่มปุ่ม **"➕ แนบบิล/ใบกำกับภาษี"** ในแต่ละ row:

- เปิด dialog ให้เลือก vendor (หรือสร้างใหม่) + อัปโหลดไฟล์บิล + กรอก invoice_number, vat_amount, wht_amount
- ระบบสร้าง `vendor_invoices` row พร้อม `matched_expense_id` ชี้กลับไปที่ expense เดิม
- ถ้ามี WHT > 0:
  - แก้ amount ของ expense เดิมจาก Net → Gross
  - สร้าง expense row ใหม่ category="ภาษีหัก ณ ที่จ่าย" จำนวน = wht_amount (Liability — ตาม WHT Accounting Model ที่ใช้อยู่)
  - link ทั้ง 2 รายการเข้า `wht_certificates` (status=draft) เพื่อรอออกหนังสือ

**B. LINE Bot — เพิ่ม keyword command:**
ปัจจุบันทุกรูปกลายเป็น expense ทันที เปลี่ยนเป็น:

- รูปที่ caption มีคำว่า `#บิล` / `#invoice` / `#ใบกำกับ` → บันทึกเข้า `vendor_invoices` (pending) แทน expense
- ถ้ามี caption `#wht3 5000` (3% จาก gross 5000) → ระบบคำนวณและสร้างคู่ expense+WHT ทันที
- รูปสลิปธรรมดา (ไม่มี hashtag) → ทำงานเหมือนเดิม

**❓ ขอคำตอบ 2 ข้อ:**

- **B1:** อยากใช้ hashtag commands ใน LINE หรือใช้แค่วิธี A (ทำใน web เท่านั้น)?
- **B2:** WHT auto-match — เมื่อแนบบิลย้อนหลังที่มี WHT, อยากให้ระบบ:
  - (a) สร้าง expense WHT แยกเลย (Liability) แล้วยอด expense เดิมปรับเป็น Gross อัตโนมัติ, หรือ
  - (b) แค่บันทึก wht_amount ใน `vendor_invoices` ไว้ — ไม่แตะ expense เดิม (ใช้แค่เป็นข้อมูลออก WHT cert)

---

### 3️⃣ Date Validation — ทำให้แม่นยำขึ้น

**สถานะปัจจุบัน:**

- `expense-edit-dialog.tsx`: block ปี > 2500 (พ.ศ.) และเตือนถ้าอนาคต > 1 ปี ✅
- `analyze-receipt` edge function: ถ้า OCR อ่านปีต่างจาก current year > 1 → บังคับเป็น current year ✅
- **จุดอ่อน:** การ insert ตรงๆ จาก code อื่น (LINE webhook, manual SQL, CSV import) ยังไม่มี guard ระดับ DB

**ข้อเสนอเพิ่มความแม่นยำ (DB-level):**
เพิ่ม **trigger validation** ที่ตาราง `expenses` (BEFORE INSERT/UPDATE):

```sql
-- ถ้า year > 2500 → auto-convert พ.ศ. → ค.ศ. (-543) แล้ว set needs_review=true
-- ถ้า year < 2015 หรือ > current_year + 1 → REJECT พร้อม error message
```

**ข้อดี:**

- ป้องกันทุก insert path (LINE, CSV, manual, edge functions)
- พ.ศ. ถูก auto-fix ทันทีไม่หาย
- ปีเพี้ยนแบบเก่า (2018, 2083) จะถูกปฏิเสธตั้งแต่ระดับฐานข้อมูล

**❓ ขอคำตอบ:** อยากให้ trigger:

- (a) **Auto-fix + flag** (เปลี่ยน 2569 → 2026 อัตโนมัติ พร้อม needs_review) — ปลอดภัยสุด ไม่มี error ขัดจังหวะ
- (b) **Reject + error** ให้ user แก้เอง — เข้มงวดกว่า แต่อาจขัดจังหวะ LINE bot
- (c) ทั้ง 2 อย่าง: auto-fix สำหรับช่วง พ.ศ. (2540-2580), reject สำหรับปีเพี้ยนอื่น (เช่น 2018, 2099)

---

### สรุปสิ่งที่ต้องการคำตอบก่อนเริ่ม

1. **บัตร ปชช. Patchanee** → สร้าง staff_profile ใหม่ 
2. **LINE hashtag commands** สำหรับบิล → อันนี้สงสัยว่าเราต้องใส่ # ตอนไหน ในเอกสารหรือว่า การเห็นข้อความนี้บนเอกสารก็เพียงพอแล้ว 
3. **WHT reverse-match** → แตะ expense เดิม (Liability model) หรือเก็บแค่ใน vendor_invoices?  ต้องทำให้ครบ ให้สามารถสรุปรายการหักภาษีที่ต้องชำระให้สรรพากรให้ครบถ้วนด้วย (ไม่ค่อยแน่ใจ ช่วยอธิบายเพิ่มเติม) 
4. **Date trigger** → auto-fix