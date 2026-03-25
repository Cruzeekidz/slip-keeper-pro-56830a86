

# Lazy Loading สำหรับ App.tsx

คำแนะนำนี้เหมาะสมและไม่กระทบ config ที่ตั้งไว้แล้ว (QueryClient config ยังคงเหมือนเดิม)

## สิ่งที่จะแก้ไข

แก้ไฟล์เดียว: `src/App.tsx`

1. **เปลี่ยน import ปกติ → `lazy()`** สำหรับ 28 หน้าที่ไม่ใช่หน้าหลัก
2. **คง import ปกติ** สำหรับ `Index`, `Auth`, `NotFound` (ใช้บ่อย/เล็ก)
3. **เพิ่ม `<Suspense>`** ครอบ `<Routes>` พร้อม loading indicator ภาษาไทย
4. **คง QueryClient config** ที่ตั้งไว้แล้วทุกประการ

## ผลที่ได้

- Initial bundle เล็กลงมาก (โหลดแค่ 3 หน้าแทน 31 หน้า)
- หน้าอื่นโหลดเมื่อ navigate ไปจริงเท่านั้น
- ไม่กระทบ functionality ใดๆ ที่มีอยู่

## หมายเหตุ

- `ResetPassword` ควร lazy ด้วยเพราะใช้ไม่บ่อย (ต่างจากที่ Claude แนะนำให้ไม่ lazy แต่ไม่มีผลเสีย)
- Vite จะ auto-split chunks ให้ ไม่ต้อง config เพิ่ม

