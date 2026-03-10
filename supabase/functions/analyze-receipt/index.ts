import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANALYSIS_PROMPT = `วิเคราะห์สลิปการโอนเงินนี้และจัดหมวดหมู่ตามระบบ:

## ระบบหมวดหมู่ 3 ระดับ:

### 1. TRANSFER (การโอนเงินระหว่างบัญชี - ไม่ใช่ค่าใช้จ่ายจริง)
สังเกต: จ่ายบัตรเครดิต (CardX, SCB Card, UOB, กรุงศรี), คืนหนี้/เงินยืม, โอนข้ามบัญชีตัวเอง, ผ่อนชำระ
Subcategories: จ่ายบัตรเครดิต, คืนหนี้/เงินยืม, โอนข้ามบัญชี, ผ่อนชำระ

### 2. BUSINESS (ค่าใช้จ่ายธุรกิจ)
Groups:
- EVENT: งานอีเวนท์ → project_tag = "EVT-ชื่ออีเวนท์"
  Expense Subcategories: Staff, Printing, Venue, Prizes, Transport, Marketing, Refund, Other
  Income Subcategories: Registration, Sponsorship, Product Sales, Other Income
- PROGRAM: โปรแกรมสอน → project_tag = "PROG-ชื่อโปรแกรม"
  Subcategories: Staff, Equipment, Venue, Other
- VENUE: สนามจักรยาน operations
  Subcategories: Stock (น้ำ/ไอติม), Maintenance, Utilities, Other
- ENTITY_KUKANANG: ธุรกิจคู่ขนาน (Parallel School)
  Subcategories: Staff, Venue, Equipment, Marketing, Utilities, Other
- ENTITY_BCC: ธุรกิจ BCC
  Subcategories: Staff, Venue, Equipment, Marketing, Utilities, Other
- GENERAL: ค่าใช้จ่ายทั่วไปบริษัท
  Subcategories: Salary, Marketing & Ads, Accounting, Consulting, Vehicle, Software & Subscription, Legal, Logistics, Investment, Utilities, Other

### 3. PERSONAL (ส่วนตัว)
Subcategories: Food & Drinks, Health & Wellness, Transport, Family & Kids, Self-Development, Donation, Entertainment, Insurance, Shopping, Other

## 🔍 การวิเคราะห์ Memo/Caption (สำคัญมาก!)
ถ้ามี memo/caption ส่งมาพร้อมสลิป ให้ใช้ memo เป็นแหล่งข้อมูลหลักในการจัดหมวดหมู่ เพราะมักมีข้อมูลที่แม่นยำกว่าสลิป

### รูปแบบ Memo ที่พบบ่อย:

1. **จ่ายค่าแรงสตาฟ**: "[ชื่อ] [X] วัน [ชื่ออีเวนท์]"
   ตัวอย่าง: "จ๋า 2 วัน Terminal21", "บอล 3 วัน Rockstar3"
   → transaction_type: BUSINESS, category_group: EVENT
   → project_tag: "EVT-[ชื่ออีเวนท์]", subcategory: "Staff"
   → staff_name: ชื่อที่กล่าวถึง, days_worked: จำนวนวัน, event_name: ชื่ออีเวนท์

2. **สตาฟ + ตำแหน่ง**: "[ชื่อ] [ตำแหน่ง] [ชื่ออีเวนท์]"
   ตัวอย่าง: "โบว์ MC Rockstar3", "เอ็ม Sound KMT41"
   → transaction_type: BUSINESS, category_group: EVENT
   → project_tag: "EVT-[ชื่ออีเวนท์]", subcategory: "Staff"
   → staff_name: ชื่อ, event_name: ชื่ออีเวนท์

3. **ของ/บริการสำหรับอีเวนท์**: "[สินค้า/บริการ] [ชื่ออีเวนท์]"
   ตัวอย่าง: "Poster Rockstar3", "เสื้อ KMT41", "ป้าย Terminal21"
   → transaction_type: BUSINESS, category_group: EVENT
   → project_tag: "EVT-[ชื่ออีเวนท์]", subcategory: "Printing" (สำหรับ poster/ป้าย/เสื้อ) หรือ subcategory ที่เหมาะสม
   → event_name: ชื่ออีเวนท์

4. **Entity indicator**: memo มี "คู่ขนาน" หรือ "พระราม 2"
   → transaction_type: BUSINESS, category_group: ENTITY_KUKANANG
   memo มี "BCC"
   → transaction_type: BUSINESS, category_group: ENTITY_BCC

## กฎการจัดหมวดพิเศษ:
- ถ้ามี "คู่ขนาน" หรือ "พระราม 2" → ENTITY_KUKANANG
- ถ้ามี "BCC" → ENTITY_BCC
- ถ้ามี "3BB", "ทริปเปิลที", "TRUE", "AIS" (internet/phone) → BUSINESS > GENERAL > Utilities
- ถ้าเป็นเงินเข้า/ค่าสมัคร/สปอนเซอร์ → transaction_direction = INCOME

## ข้อมูลที่ต้องดึง:
- amount, date (YYYY-MM-DD ค.ศ.), time, description, merchant, sender, receiver, transaction_id
- transaction_type: TRANSFER / BUSINESS / PERSONAL
- category_group: EVENT / PROGRAM / VENUE / ENTITY_KUKANANG / ENTITY_BCC / GENERAL (เฉพาะ BUSINESS) หรือ null
- project_tag: เช่น "EVT-Rockstar3", "PROG-BikeClass" หรือ null
- subcategory: จากรายการด้านบน
- transaction_direction: INCOME หรือ EXPENSE (default EXPENSE, ใช้ INCOME ถ้าเป็นรายรับ เช่น ค่าสมัคร/สปอนเซอร์)
- confidence_score: 0-100
- staff_name: ชื่อสตาฟที่กล่าวถึงใน memo (null ถ้าไม่มี)
- days_worked: จำนวนวันทำงาน (null ถ้าไม่มี)
- event_name: ชื่ออีเวนท์ที่ดึงจาก memo หรือสลิป (null ถ้าไม่มี)

**สำคัญ**: ถ้าหาข้อมูลไม่พบให้ใส่ null, ให้ confidence_score ต่ำ (<75) ถ้าไม่แน่ใจ
**สำคัญมาก**: Memo/caption มักให้ข้อมูลการจัดหมวดที่แม่นยำกว่าสลิป ให้ใช้ memo เป็นหลัก`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "extract_receipt_data",
    description: "Extract transaction data from receipt image and memo",
    parameters: {
      type: "object",
      properties: {
        amount: { type: ["number", "null"] },
        date: { type: ["string", "null"] },
        time: { type: ["string", "null"] },
        description: { type: ["string", "null"] },
        merchant: { type: ["string", "null"] },
        sender: { type: ["string", "null"] },
        receiver: { type: ["string", "null"] },
        transaction_id: { type: ["string", "null"] },
        transaction_type: { type: ["string", "null"], enum: ["TRANSFER", "BUSINESS", "PERSONAL", null] },
        category_group: { type: ["string", "null"], enum: ["EVENT", "PROGRAM", "VENUE", "ENTITY_KUKANANG", "ENTITY_BCC", "GENERAL", null] },
        project_tag: { type: ["string", "null"] },
        category: { type: ["string", "null"] },
        project: { type: ["string", "null"] },
        subcategory: { type: ["string", "null"] },
        confidence_score: { type: ["number", "null"] },
        transaction_direction: { type: ["string", "null"], enum: ["INCOME", "EXPENSE", null] },
        staff_name: { type: ["string", "null"] },
        days_worked: { type: ["number", "null"] },
        event_name: { type: ["string", "null"] },
      },
      required: ["amount", "date", "time", "description", "merchant", "sender", "receiver", "transaction_id", "transaction_type", "category_group", "project_tag", "subcategory", "confidence_score", "transaction_direction", "staff_name", "days_worked", "event_name"],
      additionalProperties: false
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, isPDF, storagePath, memo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let imageUrl = fileBase64;
    try {
      if (storagePath) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env vars");
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: signed, error: signErr } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
        if (signErr || !signed?.signedUrl) throw new Error("Failed to sign URL");
        imageUrl = signed.signedUrl;
      }
    } catch (e) {
      console.warn('Falling back to base64:', e);
    }

    // Build prompt with memo if available
    let promptText = ANALYSIS_PROMPT;
    if (memo) {
      promptText += `\n\n## Memo/Caption ที่ส่งมาพร้อมสลิป:\n"${memo}"\n\nให้ใช้ข้อมูลจาก memo นี้เป็นหลักในการจัดหมวดหมู่และดึงข้อมูล staff_name, days_worked, event_name`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const extractedData = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ success: true, data: extractedData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedData = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify({ success: true, data: extractedData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e) { console.error("Failed to parse JSON:", e); }
    }

    throw new Error("Could not extract data from receipt");
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
