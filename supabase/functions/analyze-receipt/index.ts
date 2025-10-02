import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, isPDF } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing receipt ${isPDF ? 'PDF' : 'image'}...`);

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
- รายละเอียด/หมายเหตุ (description)
- ชื่อผู้รับหรือร้านค้า (merchant)

ตอบกลับในรูปแบบ JSON เท่านั้น:
{
  "amount": "จำนวนเงินเป็นตัวเลข",
  "date": "YYYY-MM-DD",
  "description": "รายละเอียด",
  "merchant": "ชื่อผู้รับ/ร้านค้า"
}

ถ้าหาข้อมูลไหนไม่พบให้ใส่ null`
              },
              isPDF ? {
                type: "document",
                document: {
                  url: fileBase64
                }
              } : {
                type: "image_url",
                image_url: {
                  url: fileBase64
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
                  description: { type: ["string", "null"] },
                  merchant: { type: ["string", "null"] }
                },
                required: ["amount", "date", "description", "merchant"],
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
