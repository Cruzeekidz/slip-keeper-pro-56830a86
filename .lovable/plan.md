

# เพิ่มอีเวนท์ทั้งหมด (60+ งาน) เข้า event_registry

## ข้อมูลที่ได้รับ

- ปี 2569 (2026): 7 งาน
- ปี 2568 (2025): 22 งาน  
- ปี 2567 (2024): 25 งาน
- ปี 2566 (2023): 3 งาน
- **รวม ~57 งาน**

## แนวทาง Project Tag

ใช้รูปแบบ: `EVT-{สถานที่ย่อ}-{YYYYMMDD}` เพื่อให้ทุกงานไม่ซ้ำกัน เช่น:

```text
EVT-Westville-20250607     → Westville Kids Balance Bike @ Central Westville (7 มิ.ย. 68)
EVT-Westgate-20251011      → Cruzee Trick or Treat @ Central Westgate (11 ต.ค. 68)
EVT-T21R3-20241031         → Terminal 21 Rama3 Tournament #4 (31 ต.ค. 67)
EVT-CruzeeWarrior-20240630 → Cruzee Warrior The New Empire (30 มิ.ย. 67)
```

## Aliases ของแต่ละงาน

แต่ละงานจะมี aliases จากชื่อเต็ม + ชื่อสถานที่ + ชื่อย่อ เพื่อให้ AI จับคู่ได้ เช่น:
- `["Westville Kids Balance Bike", "Central Westville 7 มิ.ย.", "westville jun 2025"]`

## สิ่งที่จะทำ

1. **ลบ event_registry เดิมที่ซ้ำซ้อน** — เช่น `EVT-Terminal21-2024`, `EVT-Westville2024`, `EVT-Westgate2024` ที่ไม่มีวันที่ชัดเจน → แทนที่ด้วยรายการแยกตามงานจริง
2. **Insert 57 งาน** เข้า event_registry พร้อม event_date, aliases, project_tag ที่ถูกต้อง
3. **อัปเดต AI prompt** ใน `analyze-receipt` ให้ใช้ format tag ใหม่ `EVT-{venue}-{YYYYMMDD}` และจับคู่จากวันที่สลิป ± 7 วัน กับ event_date

## ข้อดี

- ค่าใช้จ่ายก่อน/หลังวันงานจะถูกจับคู่กับงานที่ใกล้เคียงที่สุด
- งานที่จัดซ้ำสถานที่เดิม (เช่น Westgate หลายครั้งในปีเดียว) จะแยกกันชัดเจน
- สรุป P&L ได้ต่องาน

## รายละเอียดทางเทคนิค

- ใช้ `supabase--insert` tool เพื่อ insert ข้อมูลทั้งหมด
- แปลงวันที่จาก พ.ศ. → ค.ศ. (เช่น 2569 → 2026)
- งานที่มีช่วงวันที่ (31 ต.ค. - 2 พ.ย.) ใช้วันแรกเป็น event_date

