

# ปรับปรุงโครงสร้างโฟลเดอร์ Storage — แยกตาม Entity + เดือน/ปี

## โครงสร้าง Path ใหม่

```text
receipts/
├── personal/{userId}/{year}/{month}/{timestamp}.ext      ← ค่าใช้จ่ายส่วนตัว
├── business/{userId}/{year}/{month}/{timestamp}.ext      ← ธุรกิจหลัก (เม้งซิน)
├── bcc-next/{userId}/{year}/{month}/{timestamp}.ext      ← BCC Next
├── kukanang/{userId}/{year}/{month}/{timestamp}.ext      ← คู่ขนาน
├── transfer/{userId}/{year}/{month}/{timestamp}.ext      ← โอนเงิน
├── vendor-bills/{ownerId}/{year}/{month}/{timestamp}.ext ← บิลคู่ค้า
├── expense-claims/{staffId}/{year}/{month}/{timestamp}.ext ← เบิกค่าใช้จ่าย
├── payment-slips/{userId}/{year}/{month}/{timestamp}.ext ← สลิปจ่ายค่าแรง
├── substitute-receipts/...                               ← (มีแยกเดือน/ปีอยู่แล้ว ✓)
└── line/...                                              ← (มีแยกเดือน/ปีอยู่แล้ว ✓)
```

Entity ถูกกำหนดจาก `transaction_type` + `category_group`:
- **personal** = `PERSONAL`
- **transfer** = `TRANSFER`
- **bcc-next** = `BUSINESS` + `ENTITY_BCC_NEXT`
- **kukanang** = `BUSINESS` + `ENTITY_KUKANANG`
- **business** = `BUSINESS` + อื่น ๆ (EVENT, PROGRAM, VENUE, GENERAL)

## แผนงาน

### 1. สร้าง `src/lib/storage-path.ts` — helper กลาง

ฟังก์ชัน `buildReceiptPath(type, categoryGroup, userId, fileName, refDate?)` คืน path ตามโครงสร้างใหม่ และ `buildUploadPath(docType, userId, fileName, refDate?)` สำหรับ vendor-bills, expense-claims, payment-slips

### 2. ปรับ 6 จุดอัพโหลดให้ใช้ path ใหม่

| ไฟล์ | เปลี่ยนจาก | เปลี่ยนเป็น |
|------|-----------|-------------|
| `expense-upload.tsx` | `{userId}/{ts}.ext` | `{entity}/{userId}/{Y}/{M}/{ts}.ext` |
| `BulkUpload.tsx` | `{userId}/{ts}-{i}.ext` | `{entity}/{userId}/{Y}/{M}/{ts}-{i}.ext` |
| `VendorBillUpload.tsx` | `vendor-bills/{owner}/{ts}-name` | `vendor-bills/{owner}/{Y}/{M}/{ts}-name` |
| `ExpenseClaimSection.tsx` | `expense-claims/{staff}/{ts}.ext` | `expense-claims/{staff}/{Y}/{M}/{ts}.ext` |
| `StaffPayments.tsx` | `{userId}/payment-slips/{ts}.ext` | `payment-slips/{userId}/{Y}/{M}/{ts}.ext` |
| `PaymentQueue.tsx` | `payment-slips/{userId}/{ts}.ext` | `payment-slips/{userId}/{Y}/{M}/{ts}.ext` |

### 3. ปรับหน้าคลังสลิป (ReceiptArchive) ให้แยกระดับ Entity

เพิ่มระดับโฟลเดอร์ใหม่: **Entity** → ปี → เดือน → ไฟล์

โดยใช้ข้อมูล `transaction_type` + `category_group` จากฐานข้อมูลในการจัดกลุ่ม (ไม่ต้อง scan storage)

### 4. ไฟล์เก่าไม่กระทบ

ไฟล์ที่อัพโหลดไปแล้วยังเข้าถึงได้จาก URL เดิมในฐานข้อมูล เฉพาะไฟล์ใหม่เท่านั้นที่ใช้โครงสร้างใหม่

