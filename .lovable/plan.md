## สรุปสถานการณ์

ตรวจสอบในระบบแล้ว พบ 2 เรื่อง:

### เรื่อง 1: รายการ 21,000 ที่ส่งจาก LINE "Nam Cruzee Pumptrack"
- ✅ **มีรายการในระบบจริง** — expense id `b019c9c1` "ค่าจ้างครูจ๋า PlayBox /BCC" 21,000 บาท วันที่ 6 พ.ค. 2026 (สาเหตุที่ไม่เห็น คาดว่าฟิลเตอร์ Entity/วันที่ไม่ตรง — รายการนี้อยู่ใน BCC)
- ✅ **มีใบเรียกเก็บเงินตรงกัน** — staff_invoice `b874cb1f` ครูจ๋า (ลัดดาวัลย์), Play Box 2026, net 21,000, status `approved`, ยังไม่ paid
- ❌ **Auto-match ไม่ทำงาน** เพราะ:
  - ทีมงาน "ครูจ๋า" ยังไม่มี `line_user_id`
  - ชื่อในสลิปเป็นภาษาอังกฤษ `MS. LADDAWAN NAWAEAMWILAI` แต่ในระบบเป็นภาษาไทย `ลัดดาวัลย์ นาวาเอี่ยมวิไล` → จับคู่ชื่อไม่ติด
  - เลขบัญชีในสลิปอาจไม่ครบหรือคนละ format กับ `184-2-873270`

### เรื่อง 2: หน้า /line-user-roles ยังลิงค์กับทะเบียนทีมงาน/คู่ค้าไม่ได้
ปัจจุบันแสดงแค่ชื่อ LINE + role แต่แอดมินยังต้องไปหน้าทีมงาน/คู่ค้าแล้วใส่ LINE ID เอง

---

## แผนการแก้ไข

### Part A — เพิ่มปุ่ม "ลิงค์กับทะเบียน" บนการ์ดแต่ละคน (`/line-user-roles`)

ในการ์ด `LineUserRoles.tsx` เพิ่ม section ใหม่ใต้ Select Role:

```text
[👤 Display Name]              [Role: admin ▼]
   Uxxxxxxxxxxxxx
   ─────────────────────────────────────────
   🔗 ผูกกับ: [ยังไม่ได้ผูก]   [เลือกทีมงาน/คู่ค้า ▼]
```

- Combobox ค้นหาได้: รวมรายการ `staff_profiles` + `vendor_profiles` ที่ `line_user_id IS NULL`
- เลือกแล้ว → เรียก `link_staff_line_id` หรือ `link_vendor_line_id` (RPC ที่มีอยู่แล้ว) โดยส่ง `p_staff_id`/`p_vendor_id` ตรงๆ
- ถ้าผูกแล้ว แสดงชื่อ + ปุ่ม "ยกเลิกการผูก" (set `line_user_id = null`)
- โหลดสถานะ "ผูกแล้ว" โดย query `staff_profiles`/`vendor_profiles` WHERE `line_user_id = X.line_user_id`

### Part B — แก้รายการ 21,000 ที่หลุด (one-time fix)

เชื่อม expense `b019c9c1` ↔ staff_invoice `b874cb1f`:
- update `staff_invoices`: `status='paid'`, `paid_at=now()`, `payment_slip_url`= receipt_url ของ expense, `matched_expense_id='b019c9c1...'`

### Part C (เสริม) — ปรับ auto-match ให้แม่นขึ้น

เพิ่มเงื่อนไขจับคู่:
1. **ถ้า LINE user ผูกกับ staff แล้ว** → ใช้ `line_user_id` ของผู้ส่งสลิปไปหา staff โดยตรง แล้วจับคู่ใบเรียกเก็บที่ pending ของ staff คนนั้น (ตรงสุด ไม่ต้องเดาชื่อ)
2. รองรับการเทียบชื่อไทย ↔ อังกฤษ โดยใช้ field `staff_profiles.staff_name` + `nickname` แบบ token contains (split คำแล้วเทียบทีละคำ — "LADDAWAN" จะตรงกับ field ใหม่ที่อาจเก็บ)
3. ถ้าจำนวนเงินตรง + เป็นยอดเดียวที่ pending ในกลุ่มที่ LINE user ผูกอยู่ → จับคู่อัตโนมัติ

> Part C จะลด false-negative เคสนี้ในอนาคต หลังจากที่ Part A ใช้ผูก LINE ของครูจ๋าแล้ว

---

## รายละเอียดเทคนิค

- ไฟล์ที่แก้:
  - `src/pages/LineUserRoles.tsx` — เพิ่ม linking UI (Combobox + state)
  - `supabase/functions/line-webhook/index.ts` — เพิ่ม priority match by `line_user_id` ใน auto-match
- ใช้ RPC ที่มีอยู่: `link_staff_line_id(p_owner, p_phone, p_line_user_id, p_staff_id)` และ `link_vendor_line_id(...)` โดยส่ง phone เป็น `''` เพราะใช้ `p_staff_id` ตรง
- ไม่ต้องสร้างตาราง/migration ใหม่
- One-time fix รัน `UPDATE staff_invoices` ผ่าน insert tool (มี read+insert; UPDATE ต้องใช้ migration → ใช้ migration แบบ data-only หรือทำผ่าน UI หลังเพิ่มฟีเจอร์ก็ได้)

อนุมัติแผนนี้แล้วเริ่มทำได้เลยครับ
