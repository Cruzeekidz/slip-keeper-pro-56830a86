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

    // Prefer using a signed URL from storage when available to avoid huge base64 payloads
    let imageUrl = fileBase64;
    try {
      if (storagePath) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error("Missing Supabase env vars");
        }
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: signed, error: signErr } = await supabase
          .storage
          .from('receipts')
          .createSignedUrl(storagePath, 300);
        if (signErr || !signed?.signedUrl) {
          throw new Error(`Failed to sign URL: ${signErr?.message || 'unknown error'}`);
        }
        imageUrl = signed.signedUrl;
        console.log('Using signed URL for analysis');
      }
    } catch (e) {
      console.warn('Falling back to base64 due to signed URL issue:', e);
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
                text: `วิเคราะห์สลิปการโอนเงินนี้และดึงข้อมูลต่อไปนี้ออกมา:
- จำนวนเงิน (amount)
- วันที่ทำรายการ (date) ในรูปแบบ YYYY-MM-DD 
  **สำคัญ**: ปีในสลิปอาจเป็น พ.ศ. หรือ ค.ศ.
  - ถ้าปีขึ้นต้นด้วย 25 (เช่น 2568) = ปี พ.ศ. ให้แปลงเป็น ค.ศ. โดยลบ 543 (เช่น 2568 -> 2025)
  - ถ้าปีขึ้นต้นด้วย 20 (เช่น 2025) = ปี ค.ศ. ใช้ตามที่เป็น
  ต้องส่งกลับมาเป็นปี ค.ศ. เสมอในรูปแบบ YYYY-MM-DD
- เวลาทำรายการ (time) ในรูปแบบ HH:MM:SS (24 ชั่วโมง) ถ้าไม่มีเวลาในสลิปให้ใส่ null
- ชื่อผู้รับหรือร้านค้า (merchant)
- ชื่อผู้โอน/ผู้ส่งเงิน (sender) - ชื่อบัญชีผู้โอน
- ชื่อผู้รับเงิน (receiver) - ชื่อบัญชีผู้รับ
- รหัสอ้างอิง/Transaction ID (transaction_id) - อาจมีชื่อเรียกต่างกันเช่น "รหัสอ้างอิง", "เลขที่อ้างอิง", "Ref No.", "Reference Number", "Transaction ID", "Transaction Ref"

**สำคัญมาก - วิเคราะห์ช่องบันทึก/Memo/Remark/หมายเหตุ:**
ช่องบันทึกอาจมี pattern พิเศษ: "ชื่อรายการ/ประเภท/โปรเจค/ประเภทย่อย"
ตัวอย่าง: "ค่าอาหารเช้า/ค่าใช้จ่ายส่วนตัว/บูธขายของ/อาหาร" หรือ "ค่าขนส่ง/ค่าใช้จ่ายบริษัท/ขายออนไลน์/โลจิสติกส์"

ถ้าพบ pattern นี้ในช่องบันทึก ให้แยกข้อมูลดังนี้:
- description = ส่วนแรก (ชื่อรายการ)
- category = ส่วนที่สอง (ประเภท)
- project = ส่วนที่สาม (โปรเจค)
- subcategory = ส่วนที่สี่ (ประเภทย่อย)

ถ้าไม่พบ pattern นี้ ให้ใช้ข้อมูลจากสลิปตามปกติ:
- description = ข้อความในช่องบันทึก/รายละเอียดทั้งหมด
- category = null
- project = null  
- subcategory = null

ตอบกลับในรูปแบบ JSON เท่านั้น:
{
  "amount": "จำนวนเงินเป็นตัวเลข",
  "date": "YYYY-MM-DD (ค.ศ.)",
  "description": "ชื่อรายการ",
  "merchant": "ชื่อผู้รับ/ร้านค้า",
  "sender": "ชื่อผู้โอน/ผู้ส่งเงิน",
  "receiver": "ชื่อผู้รับเงิน",
  "transaction_id": "รหัสอ้างอิง",
  "category": "ประเภท (ถ้ามีใน pattern)",
  "project": "โปรเจค (ถ้ามีใน pattern)",
  "subcategory": "ประเภทย่อย (ถ้ามีใน pattern)"
}

ถ้าหาข้อมูลไหนไม่พบให้ใส่ null`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description: "Extract transaction data from receipt image",
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
                  category: { type: ["string", "null"] },
                  project: { type: ["string", "null"] },
                  subcategory: { type: ["string", "null"] }
                },
                required: ["amount", "date", "time", "description", "merchant", "sender", "receiver", "transaction_id", "category", "project", "subcategory"],
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
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Response:", JSON.stringify(data));

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const extractedData = JSON.parse(toolCall.function.arguments);
      console.log("Extracted data:", extractedData);
      
      return new Response(
        JSON.stringify({ success: true, data: extractedData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedData = JSON.parse(jsonMatch[0]);
          return new Response(
            JSON.stringify({ success: true, data: extractedData }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.error("Failed to parse JSON from content:", e);
      }
    }

    throw new Error("Could not extract data from receipt");

  } catch (error) {
    console.error("Error in analyze-receipt function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
