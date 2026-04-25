
# แก้ปัญหารายการ 0 บาท จากการอัพโหลด 25 เม.ย. 26

## 📊 สรุปผลตรวจสอบ

| สถานะ | จำนวน | % |
|---|---|---|
| ✅ บันทึกสำเร็จ confidence ≥ 75 | 1,898 | 76.3% |
| ⚠️ บันทึกสำเร็จ confidence 50-74 (รอตรวจ) | 376 | 15.1% |
| ❌ AI วิเคราะห์ไม่สำเร็จ (0 บาท + confidence NULL) | **213** | **8.6%** |
| **รวม** | **2,487** | 100% |

**ข่าวดี**: 91% ของไฟล์บันทึกสำเร็จ ไม่ใช่เกือบทั้งหมดเป็น 0 บาทตามที่กังวลครับ

## 🔍 สาเหตุของ 213 รายการ 0 บาท

จาก `BulkUpload.tsx` บรรทัด 256-331:

```
try {
  เรียก analyze-receipt
  ถ้าสำเร็จ → ใส่ amount, date, description จริง
} catch (aiErr) {
  console.error  ← แค่ log เฉยๆ ไม่ retry
}
// แล้ว insert ด้วย amount=0, description='รอกรอกข้อมูล' เสมอ
```

ปัญหาคือ:
1. **AI Gateway timeout / 503 / network error** ระหว่างประมวลผล batch ใหญ่ 2,487 ไฟล์ติด → catch แล้วปล่อยผ่าน
2. **Retry ทำงานแค่กรณี 429** เท่านั้น (rate limit) ไม่ครอบคลุม timeout/network error
3. ระบบยัง insert record ด้วยค่า default → ได้ "ผีรายการ" 0 บาท 213 ใบ
4. ไฟล์ใน storage **ยังครบ** ทุกใบ — สามารถนำกลับมาวิเคราะห์ใหม่ได้

## 🎯 แผนการแก้ไข

### ส่วนที่ 1: หน้าเครื่องมือ "Re-analyze รายการที่ตกหล่น"

เพิ่มหน้าใหม่ `/reanalyze-failed` (หรือเป็น Tab ในหน้า BulkUpload) ที่:

- แสดงจำนวนรายการที่ AI ล้มเหลว (เงื่อนไข: `amount = 0 AND confidence_score IS NULL AND description = 'รอกรอกข้อมูล'`)
- ปุ่ม **"Re-analyze ทั้งหมด"** — ดึง receipt_url จาก storage ส่งให้ analyze-receipt อีกรอบ
- แบบ batch (concurrency 3, มี progress bar เหมือน BulkUpload)
- ผลลัพธ์: ถ้าสำเร็จ → UPDATE record เดิมด้วย amount/category/description ที่ถูกต้อง
- ถ้ายังล้มอีก → ขึ้นสถานะ "วิเคราะห์ไม่ได้" + ปุ่มลบ/แก้มือ

### ส่วนที่ 2: ปรับปรุง `BulkUpload.tsx` ป้องกันปัญหาในอนาคต

แก้ไข retry logic ที่บรรทัด 256-331:

1. **Retry ทุกประเภท error** ไม่ใช่แค่ 429:
   - Network/timeout → retry ได้ถึง 3 ครั้ง พร้อม exponential backoff (5s, 10s, 20s)
   - 5xx server error → retry
   - 429 → wait 10s
2. **ถ้าครบ 3 ครั้งแล้วยังล้ม** → mark file เป็น `'error'` แทนการ insert เป็น 0 บาท (ไม่สร้าง "ผีรายการ" อีก)
3. ลบไฟล์จาก storage ถ้า insert ไม่ได้ (ป้องกันไฟล์ค้าง)

### ส่วนที่ 3: ปรับ `analyze-receipt` Edge Function

- เพิ่ม timeout ภายใน function เป็น 60s (default Lovable AI Gateway บางทีอืดเมื่อโหลดสูง)
- Log error rate ลง console พร้อม storagePath เพื่อ debug ได้

## 🛠️ Technical Details

**Files ที่จะแก้:**
- `src/pages/BulkUpload.tsx` — ปรับปรุง retry logic + ลบไฟล์เมื่อ insert fail
- `src/pages/ReanalyzeFailed.tsx` (ใหม่) — หน้า re-analyze
- `src/App.tsx` — เพิ่ม route `/reanalyze-failed`
- `supabase/functions/analyze-receipt/index.ts` — เพิ่ม timeout + logging

**SQL Query ที่ใช้หา failed records:**
```sql
SELECT id, receipt_url, created_at FROM expenses
WHERE user_id = auth.uid()
  AND amount = 0
  AND confidence_score IS NULL
  AND description = 'รอกรอกข้อมูล'
ORDER BY created_at DESC;
```

**Re-analyze flow:**
1. ดึง list failed records → 213 ใบ
2. ส่ง storagePath ไป `analyze-receipt` (มี source: 'bulk' รักษา OCR year ของอดีต)
3. Dedup check ก่อน UPDATE (ถ้าวิเคราะห์ออกมาแล้วซ้ำกับรายการอื่น → ลบ record ผี + แจ้งเตือน)
4. UPDATE record เดิมด้วยข้อมูลใหม่

## ❓ ตัวเลือกเสริม (ขอ confirm)

- **ก่อน Re-analyze จริง** อยากให้ผมสุ่มเปิดดู 5-10 ไฟล์ในกลุ่ม 213 ก่อนไหม? เผื่อบางไฟล์เป็นภาพเสีย/ไม่ใช่สลิป (จะได้ลบทิ้งแทนการ analyze ใหม่)
- ถ้าหลัง Re-analyze แล้วยังเหลือไฟล์ที่ AI อ่านไม่ออก ต้องการให้มีปุ่ม **"ลบทั้งหมดที่เหลือ"** เพื่อเคลียร์ขยะไหม?

---

หลังอนุมัติ ผมจะลงมือทำตามแผนนี้และรันการ Re-analyze ให้ครบ 213 ใบในรอบเดียวครับ
