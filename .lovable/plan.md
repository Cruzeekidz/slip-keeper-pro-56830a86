

## แผนปรับโครงสร้างระบบภาษีหัก ณ ที่จ่าย (WHT) ให้ถูกต้องตามหลักบัญชี

### วิเคราะห์สถานะปัจจุบัน

**ปัญหาทางบัญชีที่พบ:**

1. **WHT ถูกบันทึกเป็น Expense แต่จริงๆ คือ Liability** — ตอนจ่ายเงินทีมงาน ระบบสร้างรายการใน `expenses` ด้วย category "ภาษีหัก ณ ที่จ่าย" ซึ่งในทางบัญชี WHT ที่หักไว้คือ **ภาษีค้างจ่าย (WHT Payable)** ไม่ใช่ค่าใช้จ่ายของกิจการ — แต่ในบริบทนี้มันถูกใช้เพื่อ track ต้นทุนใน P&L ซึ่งก็สมเหตุผลเพราะ WHT เป็นส่วนหนึ่งของ Gross pay
2. **ไม่มีกลไก Settlement** — ไม่มีขั้นตอน "รวบรวมรายการ → สร้างใบนำส่ง → จ่ายเงินให้สรรพากร → หักลบเครดิต"
3. **ตาราง `wht_certificates` ซ้ำซ้อน** — เก็บข้อมูลเดียวกับที่ดึงจาก `staff_invoices`/`vendor_invoices` แต่ต้องสร้างแยกด้วยมือ

**สิ่งที่ถูกต้องแล้ว:**
- WHT expense ถูกสร้างอัตโนมัติเมื่อจ่ายเงินทีมงาน (ใน `StaffPayments.tsx`)
- P&L ดึง WHT ไปคำนวณต้นทุนครบ (ผ่าน `project_tag`)

---

### หลักการบัญชีที่ควรใช้

```text
เมื่อจ่ายค่าจ้าง:
  Dr. ค่าจ้าง (Expense)     = Gross Amount    ← บันทึกใน expenses
  Cr. เงินสด/ธนาคาร         = Net Amount      ← เงินที่โอนจริง
  Cr. ภาษีหัก ณ ที่จ่ายค้างจ่าย = WHT Amount   ← เครดิตรอนำส่ง

เมื่อนำส่งสรรพากร (เดือนถัดไป):
  Dr. ภาษีหัก ณ ที่จ่ายค้างจ่าย = WHT Amount   ← ล้างเครดิต
  Cr. เงินสด/ธนาคาร         = WHT Amount      ← จ่ายเงินจริง
```

---

### แผนปรับปรุง

#### 1. สร้างตาราง `wht_remittance_batches` (ใบนำส่ง)

ตารางสำหรับรวบรวมรายการ WHT เป็นชุดนำส่งสรรพากรรายเดือน

| Column | Type | Description |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | เจ้าของ |
| batch_month | text | เดือนภาษี เช่น "2026-03" |
| pnd_type | text | "3" หรือ "53" |
| total_tax | numeric | ยอดภาษีรวม |
| status | text | draft → filed → paid |
| filed_at | timestamptz | วันที่ยื่นแบบ |
| paid_at | timestamptz | วันที่จ่ายเงิน |
| paid_expense_id | uuid | อ้างอิง expense ที่บันทึกเงินสดจ่ายออก |
| notes | text | หมายเหตุ |
| created_at | timestamptz | |

#### 2. สร้างตาราง `wht_remittance_items` (รายการในใบนำส่ง)

| Column | Type | Description |
|---|---|---|
| id | uuid | PK |
| batch_id | uuid | FK → wht_remittance_batches |
| source_type | text | "staff_invoice" หรือ "vendor_invoice" |
| source_id | uuid | ID ของ staff_invoices/vendor_invoices |
| payee_name | text | ชื่อผู้ถูกหัก |
| gross_amount | numeric | ยอดจ่าย |
| wht_amount | numeric | ภาษีหัก |
| flowaccount_url | text | ลิงก์ FA ของรายการนี้ |

#### 3. ปรับหน้า WhtReport.tsx — เหลือ 2 แท็บ

```text
┌──────────────────────────────────────────────┐
│  รายงานภาษีหัก ณ ที่จ่าย                      │
│  [เดือน ▼] [ปี ▼]                             │
├──────────────────────────────────────────────┤
│  Tab: รายงาน ภ.ง.ด. | นำส่งสรรพากร            │
├──────────────────────────────────────────────┤
│  แท็บ 1: ตาราง ภ.ง.ด.3/53                    │
│    - แสดงรายการจาก staff/vendor invoices       │
│    - ปุ่มใส่ลิงก์ FA + ส่ง LINE ในแต่ละแถว     │
│    - CSV export                               │
│    - ลบปุ่ม Printer / สร้างเอกสาร             │
│                                              │
│  แท็บ 2: นำส่งสรรพากร                         │
│    - เลือกติ๊กรายการ → สร้างใบนำส่ง (Batch)    │
│    - แสดง Batches ที่มี + สถานะ               │
│    - ปุ่ม "ยื่นแบบแล้ว" → status = filed       │
│    - ปุ่ม "จ่ายเงินแล้ว" → status = paid       │
│      → สร้าง expense เงินสดจ่ายจริง            │
│      → ลบ/หักลบ WHT expense เครดิตที่ค้างอยู่  │
└──────────────────────────────────────────────┘
```

#### 4. ลบฟังก์ชันที่ไม่ต้องการ

- ลบปุ่ม Printer (สร้างเอกสาร WHT) ออกจากแท็บรายงาน
- ลบแท็บ "ติดตาม FA" แยก — ย้ายปุ่มใส่ลิงก์ FA เข้าไปในตารางแท็บรายงาน ภ.ง.ด. โดยตรง
- ลบปุ่ม "บันทึกรายการ WHT" (Plus) ด้านบน เพราะ WHT ถูกสร้างอัตโนมัติเมื่อจ่ายเงินแล้ว
- คงไว้ `wht_certificates` table + `WhtCertificateForm` ไว้ก่อน (ไม่ลบ schema) แต่ไม่แสดงลิงก์ไปจากหน้ารายงาน

#### 5. Flow การจ่ายเงินนำส่งสรรพากร

เมื่อกด **"จ่ายเงินแล้ว"** ในใบนำส่ง:

1. สร้าง `expense` ใหม่ 1 รายการ:
   - category: "โอนเงิน" (เงินสดจ่ายจริงให้สรรพากร)
   - amount: ยอดรวม WHT ของ Batch
   - description: "นำส่งภาษีหัก ณ ที่จ่าย ภ.ง.ด.X เดือน Y/XXXX"
   - receiver: "สรรพากร"
2. Mark WHT expense items ที่เกี่ยวข้อง (category = "ภาษีหัก ณ ที่จ่าย") ว่า settled — เพิ่ม field `settled_batch_id` ใน expenses table
3. อัปเดต batch status → "paid"

#### 6. แท็บเครดิตภาษี (หน้าหลัก) สัมพันธ์กับข้อมูลจริง

แท็บ "เครดิต (WHT)" ใน expense-list-real.tsx จะ:
- แสดงเฉพาะรายการที่ยังไม่ settled (`settled_batch_id IS NULL`)
- รายการที่ settled แล้วจะไม่แสดง (เพราะถูกหักลบแล้ว)
- เพิ่มแสดงยอดคงเหลือ: ยอดเครดิตทั้งหมด - ยอดที่ settled แล้ว

---

### รายละเอียดทางเทคนิค

| ไฟล์/ส่วน | การเปลี่ยนแปลง |
|---|---|
| **Migration** | สร้างตาราง `wht_remittance_batches` + `wht_remittance_items` + เพิ่ม column `settled_batch_id` ใน `expenses` + RLS policies |
| **WhtReport.tsx** | เขียนใหม่เหลือ 2 แท็บ: รายงาน ภ.ง.ด. (รวมลิงก์ FA inline) + นำส่งสรรพากร (Batch management) |
| **expense-list-real.tsx** | แท็บ "เครดิต" แสดงเฉพาะ unsettled + เพิ่มยอดคงเหลือ |
| **WhtCertificateForm.tsx** | ลบลิงก์จากหน้ารายงาน (ไม่ลบไฟล์ แต่ไม่มีทางเข้าถึง) |
| **App.tsx** | ลบ route `/wht-certificate` |

