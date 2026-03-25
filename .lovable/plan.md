

# ปรับ QueryClient Config ใน App.tsx

เปลี่ยนจาก `new QueryClient()` ที่ไม่มี config เป็น config ที่เหมาะกับ app นี้

### สิ่งที่แก้ไข
แก้ไขไฟล์เดียว: `src/App.tsx` บรรทัดที่ 39

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: { retry: 0 }
  }
});
```

### เหตุผล
- **refetchOnWindowFocus: false** — Dashboard มีหลาย component ที่ fetch ข้อมูล การสลับ tab กลับมาจะ trigger fetch พร้อมกันหลายสิบครั้งโดยไม่จำเป็น
- **staleTime: 5 นาที** — ข้อมูลค่าใช้จ่ายไม่เปลี่ยนทุกวินาที และหน้าที่ต้องการ realtime ก็มี Supabase subscription อยู่แล้ว
- **gcTime: 10 นาที** — เก็บ cache หลัง unmount ไม่ต้อง fetch ใหม่เมื่อกลับมาหน้าเดิม
- **retry: 1** — ลดจาก default 3 ครั้ง ไม่ต้องรอนานเมื่อ Supabase มีปัญหา
- **mutations retry: 0** — ป้องกันข้อมูลซ้ำจาก auto-retry ของ insert/update

ไม่ต้องแก้ไฟล์อื่น เพราะ `QueryClientProvider` ครอบ app ทั้งหมดอยู่แล้ว

