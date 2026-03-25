

# แผนสร้างระบบจัดการหนังสือรับรองหัก ณ ที่จ่าย (แบบ FlowAccount)

## สิ่งที่จะสร้าง

### 1. หน้ารายการหนังสือรับรอง `/wht-certificates`
ตาราง List View แสดงหนังสือรับรองทั้งหมด:
- คอลัมน์: เลขที่, วันที่, ชื่อผู้รับ, ยอดจ่าย, ภาษีหัก, สถานะ (draft/completed)
- Filter เดือน/ปี + ค้นหาชื่อ
- ปุ่มแต่ละแถว: แก้ไข, พิมพ์ PDF, คัดลอกลิงก์แชร์, ลบ
- สรุปยอดรวมด้านล่าง
- ปุ่ม "สร้างหนังสือรับรองใหม่" ด้านบน

### 2. ระบบแก้ไขเอกสารเดิม (Edit Mode)
ปรับ `WhtCertificateForm.tsx` ให้รับ `?edit=<cert_id>`:
- โหลดข้อมูล certificate + items จาก DB มาเติมฟอร์ม
- เมื่อบันทึก → UPDATE แทน INSERT (ลบ items เดิม แล้ว INSERT ใหม่)
- ปุ่ม "คัดลอกลิงก์แชร์" หลังบันทึกสำเร็จ

### 3. หน้า Public สำหรับคู่ค้าดู/พิมพ์
เพิ่ม view `wht-cert` ใน `PublicPortal.tsx`:
- เปิดลิงก์ `/portal?view=wht-cert&id=xxx` ได้โดยไม่ต้อง login
- แสดงหนังสือรับรองแบบ read-only พร้อมปุ่ม "พิมพ์" และ "ดาวน์โหลด PDF"
- ใช้ database function `get_wht_certificate_public(uuid)` แบบ SECURITY DEFINER เพื่อดึงข้อมูลอย่างปลอดภัย

### 4. Database Function
สร้าง `get_wht_certificate_public(p_cert_id uuid)` ที่ return ข้อมูล certificate + items สำหรับเอกสารที่มี status = 'completed' เท่านั้น

---

## ไฟล์ที่สร้าง/แก้ไข

| ไฟล์ | รายละเอียด |
|------|-----------|
| `src/pages/WhtCertificateList.tsx` | **สร้างใหม่** — หน้ารายการ (ตาราง + filter + actions) |
| `src/pages/WhtCertificateForm.tsx` | เพิ่ม edit mode (โหลด/อัปเดตจาก DB) + ปุ่มแชร์ลิงก์ |
| `src/pages/PublicPortal.tsx` | เพิ่ม view `wht-cert` สำหรับคู่ค้าดูเอกสาร |
| `src/components/portal/WhtCertPublicView.tsx` | **สร้างใหม่** — component แสดง WHT cert แบบ read-only + ปุ่มพิมพ์ |
| `src/App.tsx` | เพิ่ม route `/wht-certificates` |
| `src/pages/Index.tsx` | เพิ่มเมนูไปยังหน้ารายการ |
| Migration SQL | สร้าง function `get_wht_certificate_public` |

---

## รายละเอียดทางเทคนิค

### Database Function
```sql
CREATE FUNCTION get_wht_certificate_public(p_cert_id uuid)
RETURNS jsonb
SECURITY DEFINER
-- คืนข้อมูล cert + items เฉพาะ status='completed'
```

### Edit Mode Logic (WhtCertificateForm)
- ถ้ามี `?edit=cert_id` → fetch cert + items → populate state
- บันทึก → `UPDATE wht_certificates` + `DELETE` items เดิม + `INSERT` items ใหม่

### Public View (WhtCertPublicView)
- เรียก `supabase.rpc('get_wht_certificate_public', { p_cert_id })` โดยไม่ต้อง auth
- Render HTML เดียวกับ PDF template แต่แสดงในหน้าเว็บ + ปุ่ม print

### Share Link Format
```
/portal?view=wht-cert&id={certificate_id}
```

