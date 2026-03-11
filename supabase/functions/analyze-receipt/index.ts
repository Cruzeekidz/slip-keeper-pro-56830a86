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

### 📌 รูปแบบ Memo มาตรฐาน:

#### A. EVENT patterns (ทั้งหมดเป็น BUSINESS > EVENT):
1. **Staff**: "[ชื่อ] [X] วัน [อีเวนท์]" หรือ "staff [อีเวนท์]"
   เช่น "จ๋า 2 วัน Terminal21" → Staff, staff_name: จ๋า, days_worked: 2
   เช่น "staff Terminal21" → Staff

2. **Staff + ตำแหน่ง**: "[ชื่อ] [ตำแหน่ง] [อีเวนท์]"
   เช่น "โบว์ MC Rockstar3" → Staff, staff_name: โบว์

3. **Prizes/รางวัล**: "medals/เหรียญ/trophy/ถ้วย/รางวัล [อีเวนท์]"
   เช่น "medals Terminal21", "ถ้วย KMT41", "เหรียญรางวัล T21" → Prizes

4. **Printing/สิ่งพิมพ์**: "poster/ป้าย/เสื้อ/banner/สติกเกอร์ [อีเวนท์]"
   เช่น "Poster Rockstar3", "เสื้อ KMT41" → Printing

5. **Venue/สถานที่**: "venue/เช่าที่/ค่าสถานที่ [อีเวนท์]"
   เช่น "venue Terminal21", "เช่าที่ KMT41" → Venue

6. **Transport/ขนส่ง**: "transport/ขนส่ง/โลจิสติกส์/ค่ารถ [อีเวนท์]"
   เช่น "ขนส่ง Terminal21", "transport KMT41" → Transport

7. **Marketing/การตลาด**: "ads/โฆษณา/marketing/boost [อีเวนท์]"
   เช่น "ads Terminal21", "boost KMT41" → Marketing

8. **Refund/คืนเงิน**: "refund/คืนเงิน/คืนค่าสมัคร [อีเวนท์]"
   เช่น "refund Terminal21", "คืนค่าสมัคร KMT41" → Refund, transaction_direction: EXPENSE

#### B. ENTITY patterns:
9. **Entity + subcategory**: "[subcategory] [entity]"
   เช่น "staff BCC" → ENTITY_BCC > Staff
   เช่น "venue คู่ขนาน" → ENTITY_KUKANANG > Venue
   เช่น "expense BCC" → ENTITY_BCC > Other

#### C. ชื่ออีเวนท์ที่รู้จัก (รวมชื่อย่อ):
- Terminal21 / T21 → project_tag: "EVT-T21", event_name: "Terminal21"
- KMT + เลข (เช่น KMT41, KMT42) → project_tag: "EVT-KMT41"
- Rockstar + เลข (เช่น Rockstar3, Rockstar4) → project_tag: "EVT-Rockstar3"
- TNV2 / Tooniverse2 → project_tag: "EVT-TNV2", event_name: "Tooniverse2"
- ชื่ออื่นๆ ที่ไม่รู้จัก → ใช้ชื่อเต็มเป็น project_tag เช่น "EVT-ชื่อ"

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

    let contentUrl = fileBase64;
    try {
      if (storagePath) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env vars");
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: signed, error: signErr } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
        if (signErr || !signed?.signedUrl) throw new Error("Failed to sign URL");
        contentUrl = signed.signedUrl;
      }
    } catch (e) {
      console.warn('Falling back to base64:', e);
    }

    // Build prompt with memo if available
    let promptText = ANALYSIS_PROMPT;
    if (memo) {
      promptText += `\n\n## Memo/Caption ที่ส่งมาพร้อมสลิป:\n"${memo}"\n\nให้ใช้ข้อมูลจาก memo นี้เป็นหลักในการจัดหมวดหมู่และดึงข้อมูล staff_name, days_worked, event_name`;
    }
    if (isPDF) {
      promptText += `\n\n(เอกสารนี้เป็นไฟล์ PDF จากธนาคาร กรุณาอ่านและวิเคราะห์เนื้อหาเช่นเดียวกับสลิปรูปภาพ)`;
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
              { type: "image_url", image_url: { url: contentUrl } }
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
