# แผนสร้างเอกสารสรุปโครงสร้างระบบ + ทิศทางพัฒนาเว็บจัดการเอกสารบัญชี

## เป้าหมาย

1. สร้างเอกสารสรุปโครงสร้างโปรแกรมทั้งหมดในรูปแบบไฟล์ `.md` ภายใน repo ที่อ่านง่ายและค้นหาได้
2. อธิบายแหล่งข้อมูลที่มีอยู่แล้ว (Project Memory, migrations, edge functions)
3. เปรียบเทียบช่องทางการใช้ AI เขียนโค้ดกับโปรเจกต์นี้ (Lovable AI vs Claude Fable)
4. วางพื้นฐานสำหรับการขยายเป็น "เว็บจัดการเอกสารทางบัญชีครบวงจร" ในภายหลัง

## สภาพปัจจุบัน (verified)

- Repo มีเฉพาะ `README.md` แบบ template และ `.lovable/plan.md`
- ไม่มีโฟลเดอร์ `docs/` หรือเอกสารสรุป architecture
- ระบบมี Project Memory บันทึกฟีเจอร์ไว้มากกว่า 30 หัวข้อ (เช่น LINE bot, WHT, duplicate detection, event sync)
- Frontend: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui + React Query มี 54 routes และ components กว่า 30 ตัว
- Backend: Lovable Cloud/Supabase มี 40+ tables, 20+ edge functions, 70+ migrations, triggers, RLS
- Integrations: LINE (LIFF/webhook), ReadyGo (one-way sync), FlowAccount (test/push จำกัด)

## ขอบเขตงานนี้

สร้างเอกสารและโครงสร้างพื้นฐานเท่านั้น ยังไม่แก้ไข business logic, ไม่เพิ่ม table ใหม่, และไม่สร้างหน้า UI ใหม่ นอกจากหน้า `/system-docs` ที่มีอยู่แล้วอาจเชื่อมโยง

## ขั้นตอนการทำงาน

### 1. สร้างโครงสร้างเอกสารใน repo

สร้างโฟลเดอร์ `docs/` และไฟล์หลักดังนี้:

- `docs/README.md` — สารบัญเอกสารทั้งหมด
- `docs/ARCHITECTURE.md` — ภาพรวมระบบ (business context, tech stack, deployment)
- `docs/DATA_MODEL.md` — กลุ่ม table หลัก: expenses, staff/vendor, events, WHT, invoices/vouchers, LINE, auth/RBAC พร้อมความสัมพันธ์
- `docs/FLOWS.md` — flow สำคัญ: ส่งสลิป/ใบเสร็จทาง LINE, ตรวจสอบซ้ำ, อนุมัติค่าจ้าง/ค่าใช้จ่าย, สร้าง voucher, WHT remittance, ReadyGo sync
- `docs/INTEGRATIONS.md` — LINE, ReadyGo, FlowAccount, storage buckets
- `docs/FRONTEND.md` — routes, components หลัก, hooks, lib utilities
- `docs/PROJECT_MEMORY_GUIDE.md` — อธิบายว่า Project Memory คืออะไร มีหัวข้ออะไรบ้าง และวิธีค้นหา

### 2. อัปเดต `README.md` หลัก

แทนที่ template ด้วยข้อมูลเฉพาะโปรเจกต์:

- ชื่อระบบและคำอธิบายสั้น
- ลิงก์ไป `docs/README.md`
- วิธีรัน dev server
- tech stack ที่ใช้จริง
- ลิงก์ Preview / Published URL (ไม่ต้องเปิดเผย Supabase ref)

### 3. สร้างสารบัญและ cross-reference

- ในแต่ละไฟล์ docs ให้มีลิงก์ข้ามไปหน้าที่เกี่ยวข้อง เช่น FLOWS → DATA_MODEL → FRONTEND
- ระบุ file path สำคัญ เช่น `src/App.tsx`, `supabase/functions/line-webhook/index.ts`
- ระบุชื่อ memory file ที่เกี่ยวข้อง เช่น `mem://features/staff-line-billing`

### 4. เปรียบเทียบ AI / Coding workflow

เพิ่มไฟล์ `docs/AI_WORKFLOW.md` ที่อธิบาย:

- **Lovable AI (ตัวนี้)**: prompt ผ่าน chat, แก้ไขอัตโนมัติใน repo, มี preview สด, เหมาะกับการพัฒนาเร็วและ UI
- **Claude Fable**: ใช้ได้โดย clone repo ไป IDE แล้วให้ Claude ช่วยวิเคราะห์/แก้ไข จากนั้น push กลับ; ข้อดีคือควบคุม environment เอง แต่ต้องจัดการ preview/deploy เอง
- **แนะนำ workflow ผสม**: ใช้ Lovable เป็นหลักสำหรับ feature/UI ใหม่ และใช้ Claude Fable เฉพาะงานวิเคราะห์โค้ดซับซ้อนหรือเมื่อต้องการทำงานนอก Lovable

### 5. เตรียมพื้นฐานสำหรับขยายเป็นระบบเอกสารบัญชี

ใน `docs/ROADMAP.md` ให้วางแผนขั้นตอนถัดไป (ยังไม่ implement):

- Phase A: ปรับปรุงเมนู/หน้าหลักให้รองรับงานเอกสาร (document hub, ค้นหา, tag)
- Phase B: เพิ่ม module บัญชีพื้นฐาน (general ledger, journal, trial balance)
- Phase C: เชื่อมต่อ FlowAccount แบบเต็มรูปแบบ (เมื่อมี production key)
- Phase D: รายงานทางบัญชี (งบกำไรขาดทุน, งบดุลเบื้องต้น)

## ผลลัพธ์ที่คาดหวัง

- มีโฟลเดอร์ `docs/` ที่อ่านง่ายและครอบคลุม
- `README.md` หลักอธิบายโปรเจกต์ได้ชัดเจน
- ผู้ใช้รู้ว่าข้อมูลลึกแต่ละฟีเจอร์อยู่ที่ไหน (memory, migrations, functions)
- มีแนวทางใช้ AI ร่วมกับโปรเจกต์
- มี roadmap สำหรับขยายเป็นระบบเอกสารบัญชี

## ไม่รวมในงานนี้

- ไม่แก้ไข business logic หรือ database schema
- ไม่สร้างหน้า UI ใหม่ (ยกเว้นอาจเพิ่มลิงก์ใน `/system-docs` หากมีอยู่แล้ว)
- ไม่ deploy หรือ publish
- ไม่เปลี่ยน Project Memory ที่มีอยู่
