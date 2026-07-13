# Phase 4 — LINE Inbox + Admin Quick Entry + FA Expense Note ตอน Approve

## สรุปที่จะทำ (3 ส่วน เชื่อมกัน)

```text
[LINE ข้อความ/ไฟล์]           [Admin Payment Queue]              [FlowAccount]
      │                              │                                 │
      ▼                              ▼                                 ▼
1. AI สร้าง draft bill  ──►  2. Inline review + edit  ──►  3. กด "อนุมัติ" 
   เก็บใน vendor_invoices          (ไม่เปิดหน้าใหม่)          → สร้าง Expense Note
   status='draft_from_line'         approve/reject               ใน FA อัตโนมัติ
```

ไม่มีหน้าใหม่ — ทุกอย่างอยู่ใน Payment Queue เดิม แค่เพิ่ม tab "รอตรวจ (จาก LINE)" + ปุ่ม inline

---

## 1. LINE Auto-draft (คู่ค้า/ทีมงาน พิมพ์ freeform มา)

### เปลี่ยน `line-webhook`
เมื่อได้ข้อความ + รูป จากคนที่ link แล้ว (vendor หรือ staff):
- ถ้ามี**รูป**อย่างเดียว → เรียก `analyze-receipt` เดิม (มีอยู่แล้ว)
- ถ้ามี**ข้อความ**อย่างเดียว หรือ **ข้อความ+รูป** → เรียก AI ใหม่:
  - Prompt: "ดึง: ยอดเงิน, VAT, WHT, วันที่, เลขที่บิล, คำอธิบาย, เลขบัญชีรับโอน จากข้อความ+รูปนี้"
  - ใช้ `google/gemini-2.5-flash` ผ่าน Lovable AI Gateway (multimodal)
- สร้าง row ใน `vendor_invoices` (ถ้าเป็น vendor) หรือ `staff_expense_claims` (ถ้าเป็น staff)
  - `status = 'draft_from_line'` (สถานะใหม่)
  - `source = 'line_freeform'`
  - แนบ receipt URL ถ้ามีรูป
  - เก็บข้อความต้นฉบับใน `line_raw_text` (column ใหม่)
- ตอบกลับใน LINE: "📝 รับบิลแล้ว รอแอดมินตรวจ ยอด XXX บาท" + Flex ปุ่ม "ดูรายการ"

### Fallback
ถ้า AI extract ไม่ได้ → สร้าง row เปล่าที่มีแค่ raw_text + รูป → admin กรอกเอง

---

## 2. Admin Review Inline (ใน Payment Queue เดิม)

### Tab ใหม่บนสุด: "🔍 รอตรวจจาก LINE" (badge = จำนวน)
รายการ draft_from_line ทั้งหมด แสดงเป็น card:

```text
┌─────────────────────────────────────────┐
│ 👤 คู่ค้า: [Combobox เลือก vendor]      │  ← ถ้ายังไม่ระบุ
│ 📅 วันที่: [__] 💰 ยอด: [__]           │  ← inline edit
│ 💧 VAT: [__] 🏷 WHT: [__] ยอดโอน: XXX  │
│ 📝 คำอธิบาย: [_____________]           │
│ 🏦 ธนาคาร: [__] เลขบัญชี: [__]         │
│ ─────────────────────────────           │
│ 📎 รูปบิล [preview]  📞 ข้อความต้นฉบับ  │
│ ─────────────────────────────           │
│ [✅ อนุมัติ + ส่ง FA] [❌ ปฏิเสธ] [🗑]  │
└─────────────────────────────────────────┘
```

- ทุก field แก้ inline (ไม่เปิด modal)
- ปุ่ม "อนุมัติ + ส่ง FA" → เปลี่ยน status เป็น `pending_payment` + trigger `flowaccount-push-expense-note` (ใหม่)
- ปุ่ม "ปฏิเสธ" → ขอเหตุผลสั้นๆ + ส่ง LINE กลับให้คนส่ง

### Admin Quick Create (สำหรับกรณีที่ admin ทำแทนเอง)
เพิ่มปุ่ม **"➕ สร้างบิลแทนคู่ค้า"** ที่มุมบนขวาของ Payment Queue → เปิด **Sheet (drawer จากขวา)** ไม่ใช่หน้าใหม่:
- Combobox เลือก vendor (มี auto-add)
- Drag-drop รูปบิล → AI OCR auto-fill
- Field ครบเหมือน card ด้านบน
- ปุ่ม "บันทึกเป็น draft" หรือ "อนุมัติ+ส่ง FA เลย"

---

## 3. FA Expense Note ตอน Approve

### Edge function ใหม่: `flowaccount-push-expense-note`
- Trigger: กด "อนุมัติ" ในหน้า Payment Queue
- สร้าง **Expense Note** (`POST /expense-notes`) — ไม่ใช่ Purchase Tax Invoice (เพราะยังไม่ได้จ่าย)
- เก็บ FA doc ID + URL ใน `vendor_invoices.flowaccount_expense_id` (column ใหม่)
- Show status badge บน card: "🟢 อยู่ใน FA (Expense)" 
- ตอนกด "จ่ายแล้ว" (Phase 3 เดิม) → ยังคงสร้าง Purchase Tax Invoice + WHT ตามเดิม

Flow บิลนึงจึงมี 3 stages ใน FA:
1. อนุมัติ → **Expense Note** (คำขอเบิก)
2. จ่ายเงิน → **Purchase Tax Invoice** (ใบกำกับซื้อ) 
3. ถ้ามี WHT → **Withholding Tax** (หนังสือ 50 ทวิ)

---

## Database migration

เพิ่มใน `vendor_invoices`:
- `source text default 'admin'` — `admin` / `line_freeform` / `line_form` / `portal`
- `line_raw_text text` — ข้อความต้นฉบับจาก LINE
- `line_sender_user_id text` — LINE user ที่ส่งเข้ามา
- `flowaccount_expense_id text`
- `flowaccount_expense_url text`

เพิ่ม status ใหม่: `draft_from_line` (แก้ CHECK constraint หรือใช้ text อยู่แล้ว)

เพิ่มใน `staff_expense_claims` (เหมือนกัน 3 columns บน) — สำหรับทีมงานที่ส่ง freeform

---

## Files ที่จะแตะ

- **Migration** — เพิ่ม columns + status
- **`supabase/functions/line-webhook/index.ts`** — เพิ่ม branch freeform + AI extract
- **`supabase/functions/flowaccount-push-expense-note/index.ts`** — ใหม่
- **`src/pages/PaymentQueue.tsx`** — Tab "รอตรวจ" + inline card + Sheet "สร้างบิลแทน"
- **`src/components/portal/VendorBillUpload.tsx`** — reuse เป็น admin mode ใน Sheet
- **Memory update** — line-bot-architecture + flowaccount-integration-constraints

---

## Scope นี้ (ไม่รวม)
- Auto-approve (มนุษย์ยืนยันเสมอ ไม่งั้น OCR พลาดจะเลอะ FA)
- Staff freeform → บัตรใน tab แยก (รอบหน้า ทำ vendor ก่อน)
- แก้ไข Expense Note บน FA จากระบบ (ถ้าจะแก้ ยกเลิกใน FA แล้วสร้างใหม่)

---

## Checklist
- [ ] Migration 5 columns + status
- [ ] Extend `line-webhook` freeform branch
- [ ] Edge function `flowaccount-push-expense-note`
- [ ] Tab + inline card ใน PaymentQueue
- [ ] Sheet "สร้างบิลแทนคู่ค้า"
- [ ] Reject flow + LINE reply
- [ ] Memory update

**ตอบว่า Approve** ถ้าให้ลุยตามลำดับนี้เลย
