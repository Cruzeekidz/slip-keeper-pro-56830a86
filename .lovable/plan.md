## สรุปผลตรวจสอบ

ผมตรวจฐานข้อมูลและโค้ดแล้ว พบ 2 สาเหตุ:

### ปัญหา 1: ทีมงานไม่ได้รับแจ้งเตือน LINE
- ระบบมี edge function `notify-staff-payment` พร้อมใช้งานแล้ว (ส่งทั้งรูปสลิป + ข้อความขอบคุณ)
- แต่จากตรวจสอบ DB: **ทีมงาน 4 คนล่าสุดที่ถูกจ่ายเงินไป (ลัลน์ลลิต, สิขรินทร์, พรเทพ, ปวีณา) ทุกคน `line_user_id = null`** → function เลย return ออกโดยไม่ส่ง
- ข้อความปัจจุบันยังขาดข้อมูลสำคัญที่คุณต้องการ: วันที่/เวลา/ยอด Gross/WHT/Net

### ปัญหา 2: สลิปไม่เข้าแฟ้มค่าใช้จ่ายฝั่งบัญชี
- ตอนกด "จ่ายแล้ว" ระบบเก็บสลิปไว้ที่ `staff_invoices.payment_slip_url` เท่านั้น
- ระบบสร้าง expense record เฉพาะ **WHT** (ภาษีหัก ณ ที่จ่าย) แต่**ไม่สร้าง expense สำหรับค่าจ้าง Gross เลย** → P&L ฝั่งบัญชีไม่เห็นค่าใช้จ่ายตัวนี้ และสลิปไม่ผูกกับ expense ใดทั้งสิ้น

---

## แผนแก้ไข

### 1. สร้าง Expense สำหรับค่าจ้าง + ผูกสลิปเข้าแฟ้มบัญชี
แก้ `markPaidMutation` ใน `src/pages/StaffPayments.tsx` (บรรทัด ~211–306):

เพิ่มการ insert expense ใหม่สำหรับ Gross Amount (ก่อนหรือหลัง WHT insert):

```text
expenses.insert({
  amount: gross_amount,                   // ยอดเต็ม ก่อนหัก WHT (Liability Settlement Model)
  category: "ค่าจ้างทีมงาน",
  subcategory: ตำแหน่ง/ประเภทงาน,
  description: "ค่าจ้าง [ชื่อ] - [event_name] - [invoice_number]",
  expense_date: paid_at (วันจ่ายจริง),
  transaction_direction: "EXPENSE",
  transaction_type: "BUSINESS",
  category_group: "EVENT",
  project_tag: ดึงจาก event_registry,
  staff_name, event_name,
  receiver: ชื่อทีมงาน,
  receipt_url: slipPath,                  // ★ ผูกสลิปเข้าแฟ้มบัญชี
  is_cash: paymentMethod === 'cash',
  memo_text: "จ่ายด้วย[โอน/เงินสด/เครดิต] - WHT [amount] - Net [amount]",
})
```

- ใช้ **Gross Amount** เป็นค่าใช้จ่าย (ตาม Liability Settlement Model ที่บันทึกไว้ใน core memory)
- บันทึก `expense.id` เก็บไว้ แล้วอัปเดต `staff_invoices.matched_expense_id` (column มีอยู่แล้ว) เพื่อกัน duplicate และตามรอย

### 2. ปรับข้อความแจ้ง LINE ให้ครบถ้วน (ไม่ส่งรูปสลิปซ้ำซ้อน)
แก้ `supabase/functions/notify-staff-payment/index.ts`:

- **ตัดการส่งรูปสลิป** (เพื่อประหยัดโควต้า LINE และลดความซ้ำซ้อน) — ลบ block lines 50–62
- เพิ่ม payload จากฝั่ง client: `gross_amount`, `wht_amount`, `paid_at`, `invoice_number`, `event_name`
- เปลี่ยนข้อความเป็น Flex Message หรือ text หลายบรรทัดแบบนี้:

```text
✅ โอนเงินค่าจ้างเรียบร้อยแล้ว

📋 บิล: SI-2569-1936
📅 วันที่: 4 พ.ค. 2569 เวลา 17:55 น.
🎪 งาน: [event_name]

💰 ยอดเต็ม:    1,870.00 บาท
➖ หัก ณ ที่จ่าย 3%: 120.00 บาท
─────────────
💵 ยอดสุทธิที่โอน: 1,750.00 บาท

ขอบคุณที่มาช่วยกันจัดงานดีๆให้เด็กๆนะคะ 🙏❤️
```

- ใช้ Thai Buddhist Era (ปี + 543) + ชื่อเดือนไทย ตาม core memory
- ถ้า `wht_amount = 0` ให้ซ่อนบรรทัด WHT
- ถ้า `payment_method = cash/credit` → เปลี่ยนหัวเป็น "✅ บันทึกการจ่ายเงินสด/เครดิตแล้ว"

### 3. ส่ง payload เพิ่มจาก client
แก้ call `supabase.functions.invoke("notify-staff-payment", ...)` (บรรทัด 277) ให้ส่ง:
```text
{
  staff_id, payment_method,
  gross_amount, wht_amount, net_amount,
  paid_at, invoice_number, event_name
}
// ไม่ต้องส่ง payment_slip_path อีก
```

### 4. แจ้งเตือนเมื่อทีมงานยังไม่ได้ผูก LINE
ปัจจุบัน edge function เงียบเฉยถ้าไม่มี `line_user_id` → admin ไม่รู้ว่าทำไมไม่ส่ง

เพิ่มใน UI หลังกด "ยืนยันจ่ายแล้ว":
- ถ้า response `sent: false, reason: 'no LINE ID'` → toast สีส้มแจ้ง "ทีมงาน [ชื่อ] ยังไม่ได้ผูก LINE — แนะนำให้ส่งลิงก์ /link-line ให้"
- ถ้า `sent: true` → toast เขียว "แจ้งเตือนทีมงานทาง LINE แล้ว"

---

## Technical Notes
- **ไม่มีการเปลี่ยนแปลง schema** — ใช้ `expenses.receipt_url` และ `staff_invoices.matched_expense_id` ที่มีอยู่แล้ว
- **กัน duplicate**: ก่อน insert expense เช็ค `staff_invoices.matched_expense_id` ก่อน หรือ check `expenses` ที่มี `description LIKE %invoice_number%` (กรณี repay)
- **กรณี Reopen → Repay**: ลบ expense เดิมทิ้ง หรืออัปเดต expense เดิมแทนการสร้างใหม่ (ใช้ `matched_expense_id`)
- ไม่กระทบ logic WHT, slip auto-matching, หรือ duplicate guard ที่มีอยู่
- Edge function CORS, JWT validation คงเดิม
