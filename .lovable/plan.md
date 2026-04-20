ตรวจสอบจากภาพและโค้ด `StaffInvoicePublicForm.tsx` พบสาเหตุที่ปุ่ม "ส่งใบเรียกเก็บเงิน" ถูก disable:

**ปัญหา:** บรรทัด 274

```
disabled={submitting || !form.event_name}
```

ในภาพ ผู้ใช้ "พรเทพ ต้นเสียงสม" เลือก dropdown "เลือกอีเวนท์" แต่ไม่ได้เลือกอีเวนท์จริง และไม่ได้พิมพ์ชื่องานในช่อง "หรือพิมพ์ชื่องานเอง" → `form.event_name` ว่าง → ปุ่มเทาส่งไม่ได้ และไม่มี error message บอก

**ปัญหารอง:**

1. ไม่มี hint บอกว่า "ต้องกรอกชื่องาน" — ผู้ใช้งง ทำไมปุ่มกดไม่ได้
2. ถ้า user เลือก event จาก dropdown แล้ว `event_name` auto-fill ✅ แต่ถ้าไม่มี event ในระบบ → ต้องพิมพ์เอง ซึ่ง field พิมพ์เองอยู่ด้านล่าง dropdown (กรณีไม่มี events ใน registry) — UX สับสน
3. ตรวจ validation อื่น: `daily_rate=0` ก็ส่งได้ (required แค่ HTML5) — เสี่ยงส่งใบเปล่า
4. Date trigger ใหม่ (2015 ≤ year ≤ 2027) — ถ้าผู้ใช้เผลอใส่ปี 2569 จะ auto-fix ✅ แต่ถ้าใส่ปีอื่นเพี้ยน → DB reject → toast error อาจไม่แสดงชัดเจน

---

### แผนแก้ไข — ทำให้ส่งลื่นๆ

**1. เปลี่ยน UX dropdown event (ไฟล์: `StaffInvoicePublicForm.tsx`)**

- รวม dropdown + free-text เป็น component เดียว: dropdown มีปุ่ม "+ พิมพ์ชื่อเอง" → toggle เป็น input
- ถ้าเลือกจาก dropdown → `event_name` auto-fill (มีอยู่แล้ว) ✅
- ถ้าไม่มี event ใน registry → ขึ้น input ทันที (ไม่แสดง dropdown ว่าง)

**2. เพิ่ม inline validation hints**

- แสดงข้อความสีส้ม "⚠ กรุณาเลือกหรือพิมพ์ชื่องาน" เมื่อ `event_name` ว่าง
- แสดง "⚠ ค่าแรง/วัน ต้องมากกว่า 0" เมื่อ `daily_rate <= 0`
- ปุ่ม disable พร้อม tooltip บอกเหตุผล

**3. เปลี่ยนปุ่มจาก disabled → enabled + show errors on click**

- ให้ปุ่มกดได้เสมอ → ถ้าไม่ผ่าน validation → scroll ไปยัง field ที่ผิด + highlight สีแดง
- ดีกว่า disable เงียบๆ (user งง)

**4. ปรับ error handling ของ `handleSubmit**`

- จับ error code จาก trigger DB (เช่น "Invalid expense_date year") → แปลเป็นภาษาไทย: "วันที่ไม่ถูกต้อง กรุณาตรวจสอบ"
- แสดง toast แทน inline error (เห็นชัดกว่า)

**5. เพิ่ม validation client-side ก่อนยิง insert**

- ตรวจ `work_start_date <= work_end_date`
- ตรวจ `days_worked > 0`
- ตรวจ `daily_rate > 0`
- ตรวจปี start/end อยู่ใน 2015–(ปีปัจจุบัน+1) — ป้องกันก่อนถึง DB

**6. (เสริม) Loading state ชัดเจน**

- ระหว่าง `submitting=true` → ปุ่มแสดง spinner + "กำลังส่ง..." (มีอยู่แล้ว) ✅
- เพิ่ม overlay ป้องกันกดซ้ำ

---

### ไฟล์ที่แก้

- `src/components/portal/StaffInvoicePublicForm.tsx` — UX event picker, inline validation, error handling, ปุ่มไม่ disable

ไม่ต้องแก้ DB / migration  
  
บางครั้งยังไม่ทันได้สร้าง event ถ้ามีคนสร้างชื่อ event แล้ว ให้เพิ่มใน dropdown สำหรับคนต่อไปหรือครั้งต่อไปได้เลย 

&nbsp;