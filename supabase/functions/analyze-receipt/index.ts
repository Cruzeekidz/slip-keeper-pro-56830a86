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
- ENTITY_KUKANANG: ธุรกิจคู่ขนาน (Entity 3)
  Subcategories: Staff, Venue, Equipment, Marketing, Utilities, Other
- ENTITY_BCC_NEXT: ธุรกิจ BCC Next (Entity 2) → project_tag = "BCCNEXT-ชื่อโครงการ"
  โครงการย่อย: Peca Bridge, EngineerX 2025 T1/T2, Play Box 2026
  Subcategories: Staff, Venue, Equipment, Marketing, Printing, Prizes, Transport, Utilities, Other
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

#### B. BCC Next / คู่ขนาน patterns:
9. "staff BCC" / "Peca Bridge" / "EngineerX" / "Play Box" → ENTITY_BCC_NEXT
   เช่น "staff Peca Bridge" → ENTITY_BCC_NEXT, project_tag: BCCNEXT-PecaBridge
10. "venue คู่ขนาน" → ENTITY_KUKANANG

#### C. รูปแบบ Project Tag: EVT-{สถานที่ย่อ}-{YYYYMMDD}
**สำคัญมาก**: ใช้ project_tag จากรายการอีเวนท์จริงที่ให้ไว้ด้านล่างเท่านั้น!
ห้ามสร้าง project_tag เอง — ต้องเลือกจากรายการที่มีอยู่จริง

**การจับคู่อีเวนท์จากสลิป**:
1. **ชื่องาน/สถานที่มาก่อนเสมอ**: ถ้าสลิปหรือ memo ระบุชื่อสถานที่/อีเวนท์ → ค้นหาในรายการอีเวนท์ (ชื่อ + aliases) แล้วใช้ project_tag ของงานนั้น
2. **จับคู่จากวันที่สลิป**: ถ้ามีหลายงานที่ตรงชื่อ → เลือกงานที่ event_date ใกล้วันที่สลิปที่สุด
3. **ช่วงจับคู่วันที่**: ค่าใช้จ่ายอาจเกิดก่อนงาน 30 วัน หรือหลังงาน 14 วัน
4. **สถานที่ที่มีช่วงเตรียมงานยาว** (Westville, Westgate): ค่าใช้จ่าย staff/booth ก่อนงานนานถึง 30-45 วันถือเป็นของงานนั้น
5. ถ้าไม่แน่ใจงานไหน → ใส่ project_tag เป็น null และ confidence_score ต่ำ

#### D. โครงการระยะยาว (BCCNEXT / PROGRAM):
โครงการเหล่านี้ไม่มี event_date เดียว แต่เป็นช่วงเวลา 1-3 เดือน:
- BCCNEXT-PecaBridge, BCCNEXT-EngineerX25-T1, BCCNEXT-EngineerX25-T2, BCCNEXT-PlayBox2026
- ถ้า memo ระบุชื่อโครงการ → จับคู่ได้เลยโดยไม่ต้องดูวันที่

## กฎการจัดหมวดพิเศษ:
- ถ้ามี "คู่ขนาน" หรือ "พระราม 2" → ENTITY_KUKANANG
- ถ้ามี "BCC" / "Peca Bridge" / "EngineerX" / "Play Box" → ENTITY_BCC_NEXT
- ถ้ามี "3BB", "ทริปเปิลที", "TRUE", "AIS" (internet/phone) → BUSINESS > GENERAL > Utilities
- ถ้าเป็นเงินเข้า/ค่าสมัคร/สปอนเซอร์ → transaction_direction = INCOME

## ข้อมูลที่ต้องดึง:
- amount, date (YYYY-MM-DD ค.ศ.), time, description, merchant, sender, receiver, transaction_id
- transaction_type: TRANSFER / BUSINESS / PERSONAL
- category_group: EVENT / PROGRAM / VENUE / ENTITY_KUKANANG / ENTITY_BCC_NEXT / GENERAL (เฉพาะ BUSINESS) หรือ null
- project_tag: **ต้องเลือกจากรายการอีเวนท์ที่ให้ไว้เท่านั้น** หรือ null
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
        category_group: { type: ["string", "null"], enum: ["EVENT", "PROGRAM", "VENUE", "ENTITY_KUKANANG", "ENTITY_BCC_NEXT", "GENERAL", null] },
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

// Fetch event registry and format as reference for the AI
async function getEventRegistryPrompt(supabase: any): Promise<string> {
  try {
    const { data: events, error } = await supabase
      .from('event_registry')
      .select('event_name, project_tag, event_date, aliases')
      .eq('is_active', true)
      .order('event_date', { ascending: false, nullsFirst: false });

    if (error || !events?.length) {
      console.warn('No events found in registry:', error);
      return '';
    }

    const lines = events.map((e: any) => {
      const date = e.event_date || 'ไม่มีวันที่ (โครงการระยะยาว)';
      const aliases = e.aliases?.length ? ` | aliases: ${e.aliases.join(', ')}` : '';
      return `- ${e.project_tag} | ${e.event_name} | ${date}${aliases}`;
    });

    return `\n\n## 📋 รายการอีเวนท์ที่ลงทะเบียนในระบบ (ใช้ project_tag จากรายการนี้เท่านั้น!):
${lines.join('\n')}

**คำแนะนำ**: ถ้าสลิปหรือ memo มีคำว่า "Westgate", "Westville", "Terminal21", "Rockstar" ฯลฯ → ค้นหาในรายการด้านบน แล้วเลือก project_tag ที่ event_date ใกล้วันที่สลิปมากที่สุด (±30 วันก่อน, ±14 วันหลัง, ±45 วันสำหรับ Westville/Westgate)`;
  } catch (e) {
    console.error('Error fetching event registry:', e);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { fileBase64, isPDF, storagePath, memo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create supabase client for event registry & storage
    let supabase: any = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    let contentUrl = fileBase64;
    try {
      if (storagePath && supabase) {
        const { data: signed, error: signErr } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
        if (signErr || !signed?.signedUrl) throw new Error("Failed to sign URL");
        contentUrl = signed.signedUrl;
      }
    } catch (e) {
      console.warn('Falling back to base64:', e);
    }

    // Fetch event registry to inject into prompt
    const eventRegistryPrompt = supabase ? await getEventRegistryPrompt(supabase) : '';

    // Build prompt with memo if available
    let promptText = ANALYSIS_PROMPT + eventRegistryPrompt;
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
    let extractedData: any = null;

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      extractedData = JSON.parse(toolCall.function.arguments);
    }

    if (!extractedData) {
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          }
        } catch (e) { console.error("Failed to parse JSON:", e); }
      }
    }

    if (!extractedData) {
      throw new Error("Could not extract data from receipt");
    }

    // Year validation: fix OCR year misreads
    if (extractedData.date) {
      const currentYear = new Date().getFullYear();
      const match = extractedData.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const ocrYear = parseInt(match[1], 10);
        if (Math.abs(ocrYear - currentYear) > 1) {
          console.warn(`OCR year mismatch: read ${ocrYear}, current ${currentYear}. Correcting to ${currentYear}.`);
          extractedData.date = `${currentYear}-${match[2]}-${match[3]}`;
          extractedData.needs_review = true;
          if (extractedData.confidence_score && extractedData.confidence_score > 60) {
            extractedData.confidence_score = 60;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, data: extractedData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
