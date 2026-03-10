import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, isPDF, storagePath } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing receipt ${isPDF ? 'PDF' : 'image'}...`);

    let imageUrl = fileBase64;
    try {
      if (storagePath) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars");
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: signed, error: signErr } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
        if (signErr || !signed?.signedUrl) throw new Error(`Failed to sign URL`);
        imageUrl = signed.signedUrl;
      }
    } catch (e) {
      console.warn('Falling back to base64:', e);
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
              {
                type: "text",
                text: `วิเคราะห์สลิปการโอนเงินนี้และจัดหมวดหมู่ตามระบบใหม่:

## ระบบหมวดหมู่ 3 ระดับ:

### 1. TRANSFER (การโอนเงินระหว่างบัญชี - ไม่ใช่ค่าใช้จ่ายจริง)
สังเกต: จ่ายบัตรเครดิต (CardX, SCB Card, UOB, กรุงศรี), คืนหนี้/เงินยืม, โอนข้ามบัญชีตัวเอง, ผ่อนชำระ
Subcategories: จ่ายบัตรเครดิต, คืนหนี้/เงินยืม, โอนข้ามบัญชี, ผ่อนชำระ

### 2. BUSINESS (ค่าใช้จ่ายธุรกิจ)
Groups:
- EVENT: งานอีเวนท์ (Rockstar, KMT, คู่ขนาน) → project_tag = "EVT-ชื่ออีเวนท์"
  Subcategories: Staff, Printing, Venue, Prizes, Transport, Marketing, Refund, Other
- PROGRAM: โปรแกรมสอน (BikeClass, InlineSkate) → project_tag = "PROG-ชื่อโปรแกรม"
  Subcategories: Staff, Equipment, Venue, Other
- VENUE: สนามจักรยาน operations
  Subcategories: Stock (น้ำ/ไอติม), Maintenance, Utilities, Other
- GENERAL: ค่าใช้จ่ายทั่วไปบริษัท
  Subcategories: Salary, Marketing & Ads, Accounting, Consulting, Vehicle, Software & Subscription, Legal, Logistics, Investment, Other

### 3. PERSONAL (ส่วนตัว)
Subcategories: Food & Drinks, Health & Wellness, Transport, Family & Kids, Self-Development, Donation, Entertainment, Insurance, Shopping, Other

## ดึงข้อมูลต่อไปนี้:
- amount (จำนวนเงิน)
- date (YYYY-MM-DD ค.ศ. - ถ้าปี พ.ศ. ให้ลบ 543)
- time (HH:MM:SS หรือ null)
- description (รายละเอียด)
- merchant (ชื่อร้านค้า/ผู้รับ)
- sender (ผู้โอน)
- receiver (ผู้รับเงิน)
- transaction_id (รหัสอ้างอิง)
- transaction_type: TRANSFER / BUSINESS / PERSONAL
- category_group: EVENT / PROGRAM / VENUE / GENERAL (เฉพาะ BUSINESS) หรือ null
- project_tag: เช่น "EVT-Rockstar3", "PROG-BikeClass" หรือ null
- subcategory: จากรายการด้านบน
- confidence_score: 0-100 (ความมั่นใจในการจัดหมวดหมู่)

**สำคัญ**: ถ้าหาข้อมูลไม่พบให้ใส่ null
**สำคัญ**: ให้ confidence_score ต่ำ (<75) ถ้าไม่แน่ใจว่าเป็น TRANSFER/BUSINESS/PERSONAL`
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description: "Extract transaction data from receipt image with new category system",
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
                  category_group: { type: ["string", "null"], enum: ["EVENT", "PROGRAM", "VENUE", "GENERAL", null] },
                  project_tag: { type: ["string", "null"] },
                  category: { type: ["string", "null"] },
                  project: { type: ["string", "null"] },
                  subcategory: { type: ["string", "null"] },
                  confidence_score: { type: ["number", "null"] }
                },
                required: ["amount", "date", "time", "description", "merchant", "sender", "receiver", "transaction_id", "transaction_type", "category_group", "project_tag", "subcategory", "confidence_score"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
      } catch (e) {
        console.error("Failed to parse JSON:", e);
      }
    }

    throw new Error("Could not extract data from receipt");
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
