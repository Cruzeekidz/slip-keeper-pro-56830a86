# ปรับหน้าหลักให้เป็นมืออาชีพและลื่นบนมือถือ

## ปัญหาปัจจุบัน
- หน้า `/` (Index) โหลด **ทุกรายการ** (`fetchAllExpenses` วนทีละ 1000 จนหมด) → มือถือหน่วง
- โหลด `EventAnalysis` (515 บรรทัด) ฝังอยู่ในหน้าหลัก → หน้าจอเด้งตอนเรนเดอร์เสร็จ
- ตัวกรอง/Tabs/ปุ่มแถวยาว เปิดค้างอยู่ → กินพื้นที่จอ

## สิ่งที่จะทำ

### 1. ย้าย P&L อีเวนท์ออกจากหน้าหลัก
- ลบ `<EventAnalysis recentOnly />` ออกจาก `src/pages/Index.tsx`
- เพิ่มปุ่ม **"P&L อีเวนท์"** ในแถบเมนูบน header → ลิงก์ไปหน้าใหม่ `/event-analysis`
- สร้าง `src/pages/EventAnalysisPage.tsx` ที่ห่อ `<EventAnalysis />` พร้อม header + ปุ่มย้อนกลับ
- เพิ่ม route ใน `src/App.tsx`

### 2. โหลดรายการเคลื่อนไหวแบบจำกัด (Pagination จากเซิร์ฟเวอร์)
- แก้ `fetchAllExpenses` ใน `expense-list-real.tsx` → รับ `{ limit, offset, monthFilter }`
- ค่าเริ่มต้น: **โหลด 1 เดือนล่าสุด** (filter `expense_date >= first day of current month`)
- เพิ่มตัวเลือกที่ส่วนหัวรายการ: `1 เดือน / 3 เดือน / 6 เดือน / ทั้งหมด` + page size `50 / 100 / 200`
- ปุ่ม **"โหลดเพิ่ม"** (load-more) ที่ท้ายตาราง — append ผลลัพธ์ใน React Query infinite cache (ใช้ `useInfiniteQuery`)
- เก็บการนับรวม (count) แสดง "แสดง X จาก Y รายการ"

### 3. ซ่อน/ยุบตัวกรองโดยปริยาย (โดยเฉพาะมือถือ)
- ห่อบล็อกตัวกรอง (search, entity tabs, type, category, project, date range) ด้วย `<Collapsible>` 
- ค่าเริ่มต้น: **ปิด** บนมือถือ (`useIsMobile`), เปิดบน desktop
- มีปุ่ม `[🔍 ตัวกรอง (n)]` แสดงจำนวนตัวกรองที่ active — กดเพื่อ toggle
- คงแถบ Entity tabs ที่ใช้บ่อยให้เห็นเสมอ (compact pill row)

### 4. ลดการเด้ง/Layout shift
- เพิ่ม `min-height` ให้ Suspense fallback ของ `ExpenseListReal` (`min-h-[60vh]`) → เนื้อหาขึ้นมาแล้วไม่ดันหน้า
- เพิ่ม skeleton สูงคงที่แทนข้อความ "กำลังโหลด..."
- ใส่ `min-h` ให้ `MonthlyQuickStats` กันการกระโดด
- ปิด `shouldScaleBackground` ของ Drawer ที่อาจทำให้ scroll สั่น (ตรวจหน้า edit dialog)

### 5. ดีไซน์ระดับมืออาชีพ (ปรับเล็ก-ไม่รื้อ)
- Header ส่วนปุ่มยาว → ย้ายปุ่ม `สรุปภาพรวม / รอจ่ายเงิน / P&L อีเวนท์ / CSV / ออก` เข้า dropdown "เครื่องมือ" เดียว บนมือถือ
- เก็บไว้ที่ header เฉพาะ: `[เพิ่มรายการ]` + `[≡ เมนู]` (แบบแอปธนาคาร)
- เพิ่ม **bottom sticky bar** บนมือถือ (FAB style): ปุ่ม `เพิ่มรายการ` + `กรอง` ลอยมุมขวาล่าง — ใช้งานด้วยนิ้วโป้งสะดวก
- การ์ดรายการบนมือถือใช้ layout 2 บรรทัด: บรรทัดบน = วันที่ + จำนวนเงิน (เด่น), บรรทัดล่าง = ผู้รับ + ประเภท (badge สี)

## ไฟล์ที่จะแก้
- `src/pages/Index.tsx` — ลบ EventAnalysis, ย่อแถวปุ่ม, เพิ่ม min-h ใน Suspense
- `src/pages/EventAnalysisPage.tsx` — สร้างใหม่
- `src/App.tsx` — เพิ่ม route `/event-analysis`
- `src/components/expense-list-real.tsx` — เปลี่ยน fetch เป็น infinite query + month filter, ห่อ filters ใน Collapsible, sticky bottom bar มือถือ, skeleton min-h
- `src/components/monthly-quick-stats.tsx` — ใส่ min-h กันเด้ง

## รายละเอียดเทคนิค
- ใช้ `useInfiniteQuery` ของ TanStack Query — `getNextPageParam` ตามจำนวน rows ที่ได้รับ
- Query key: `['expenses', { range, pageSize }]` เพื่อ cache แยกตามตัวเลือก
- Default range = `>= startOfMonth(new Date())` ใช้ `date-fns`
- Mobile detection: `useIsMobile()` (มีอยู่แล้ว) ใช้ตัดสินใจ default `open` ของ Collapsible
- ไม่แตะ realtime hook ปัจจุบัน (`useExpensesRealtime`) — invalidate query เดิมยังใช้ได้

## สิ่งที่จะ**ไม่**ทำในแผนนี้
- ไม่รื้อโครงสีหรือ theme
- ไม่ย้ายเมนูอื่น (StaffPayments, VendorManagement)
- ไม่แตะ schema ฐานข้อมูล
