

# ปรับปรุง Bulk Upload: เลือกโฟลเดอร์แล้วระบบทำงานเองอัตโนมัติ

## แนวคิด

แทนที่จะจำกัด 100 ไฟล์ → เลือกโฟลเดอร์ทั้งหมด (300-500 สลิป) แล้วระบบจะ:
1. อ่านไฟล์ทั้งหมดในโฟลเดอร์
2. แบ่ง batch อัตโนมัติ (ทีละ 3 ไฟล์)
3. แสดง progress แบบ real-time
4. สรุปผลเมื่อเสร็จ — ไม่ต้องคอยกดอะไรเพิ่ม

## สิ่งที่จะเปลี่ยน

### 1. ยกเลิก limit 100 ไฟล์
- รับไฟล์ไม่จำกัดจำนวนจากโฟลเดอร์
- เก็บ limit 100 สำหรับ "เลือกไฟล์" ปกติ (กันเผื่อ browser ช้า)

### 2. Auto-start เมื่อเลือกโฟลเดอร์
- เลือกโฟลเดอร์ → ระบบเริ่มประมวลผลทันทีโดยอัตโนมัติ
- ไม่ต้องกดปุ่ม "เริ่มอัพโหลด"
- แสดง progress bar รวม + สถิติ real-time (สำเร็จ/ซ้ำ/ผิดพลาด/รอตรวจ)

### 3. Background-style Queue UI
- แสดง overall progress: "กำลังประมวลผล 45/320 ไฟล์..."
- สถิติแบบ live: ✅ 30 สำเร็จ | ⚠️ 5 ซ้ำ | ❌ 2 ผิดพลาด | 🔍 8 รอตรวจ
- รายการไฟล์แสดงเป็น collapsible list (ไม่แสดงทั้ง 500 ไฟล์พร้อมกัน)
- ปุ่ม "หยุดชั่วคราว" / "ดำเนินการต่อ"

### 4. Smart Batch Processing
- ประมวลผล 3 ไฟล์พร้อมกัน (เหมือนเดิม)
- ถ้า rate limit (429) → รอ 10 วินาทีแล้วลองใหม่อัตโนมัติ
- ถ้า error → ข้ามไปไฟล์ถัดไป ไม่หยุดทั้ง batch

## ไฟล์ที่แก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/pages/BulkUpload.tsx` | ยกเลิก limit สำหรับ folder, auto-start, pause/resume, retry logic, collapsible file list |

## Technical Details

- Folder input ใช้ `webkitdirectory` attribute (มีอยู่แล้ว)
- Auto-start: เรียก `uploadAll()` ทันทีหลัง `handleFolderSelect` set files
- Pause/Resume: ใช้ `useRef` เก็บ flag `isPaused` เพื่อหยุด loop ระหว่าง batch
- Rate limit retry: ตรวจจับ 429 response จาก edge function แล้ว `setTimeout` 10s
- Collapsible list: แสดงเฉพาะ 20 รายการล่าสุด + ปุ่ม "แสดงทั้งหมด"

