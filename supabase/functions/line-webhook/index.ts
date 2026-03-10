import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-line-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = encodeBase64(new Uint8Array(sig));
  return expected === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET request = webhook URL verification
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'LINE Webhook is active' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET");
  const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
    console.error("Missing LINE credentials");
    return new Response(JSON.stringify({ error: "Missing LINE credentials" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials");
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const bodyText = await req.text();
    
    // Verify LINE signature
    const signature = req.headers.get("x-line-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifySignature(bodyText, signature, LINE_CHANNEL_SECRET);
    if (!isValid) {
      console.error("Invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(bodyText);
    const events = body.events || [];
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "image") {
        // Reply only to image messages
        if (event.type === "message" && event.message.type === "text") {
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, 
            "📸 กรุณาส่งรูปสลิปการโอนเงินมาเลยครับ ระบบจะวิเคราะห์ให้อัตโนมัติ");
        }
        continue;
      }

      const messageId = event.message.id;
      const userId = event.source.userId;
      const replyToken = event.replyToken;

      try {
        // 1. Download image from LINE
        const imageResponse = await fetch(
          `https://api-data.line.me/v2/bot/message/${messageId}/content`,
          {
            headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
          }
        );

        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBytes = new Uint8Array(imageBuffer);

        // 2. Upload to Supabase Storage
        const timestamp = Date.now();
        const storagePath = `line/${userId}/${timestamp}_${messageId}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(storagePath, imageBytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // 3. Get signed URL for AI analysis
        const { data: signedData, error: signError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(storagePath, 300);

        if (signError || !signedData?.signedUrl) {
          throw new Error("Failed to create signed URL");
        }

        // 4. Call analyze-receipt function
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        const analyzeResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                    text: `วิเคราะห์สลิปการโอนเงินนี้และจัดหมวดหมู่ตามระบบ:

## ระบบหมวดหมู่ 3 ระดับ:

### 1. TRANSFER (การโอนเงินระหว่างบัญชี)
Subcategories: จ่ายบัตรเครดิต, คืนหนี้/เงินยืม, โอนข้ามบัญชี, ผ่อนชำระ

### 2. BUSINESS (ค่าใช้จ่ายธุรกิจ)
Groups: EVENT, PROGRAM, VENUE, ENTITY_KUKANANG, ENTITY_BCC, GENERAL

### 3. PERSONAL (ส่วนตัว)
Subcategories: Food & Drinks, Health & Wellness, Transport, Family & Kids, Self-Development, Donation, Entertainment, Insurance, Shopping, Other

## ข้อมูลที่ต้องดึง:
- amount, date (YYYY-MM-DD), time, description, merchant, sender, receiver, transaction_id
- transaction_type: TRANSFER / BUSINESS / PERSONAL
- category_group, project_tag, subcategory
- transaction_direction: INCOME หรือ EXPENSE
- confidence_score: 0-100

**สำคัญ**: ถ้าหาข้อมูลไม่พบให้ใส่ null`
                  },
                  {
                    type: "image_url",
                    image_url: { url: signedData.signedUrl }
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
                      transaction_type: { type: ["string", "null"], enum: ["TRANSFER", "BUSINESS", "PERSONAL", null] },
                      category_group: { type: ["string", "null"] },
                      project_tag: { type: ["string", "null"] },
                      subcategory: { type: ["string", "null"] },
                      confidence_score: { type: ["number", "null"] },
                      transaction_direction: { type: ["string", "null"], enum: ["INCOME", "EXPENSE", null] },
                    },
                    required: ["amount", "date", "description", "transaction_type", "subcategory", "confidence_score", "transaction_direction"],
                    additionalProperties: false
                  }
                }
              }
            ],
            tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
          }),
        });

        let extractedData = null;

        if (analyzeResponse.ok) {
          const aiData = await analyzeResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            extractedData = JSON.parse(toolCall.function.arguments);
          }
        } else {
          const errText = await analyzeResponse.text();
          console.error("AI analysis failed:", errText);
        }

        // 5. Look up user by LINE userId mapping — for now use first user or skip user_id
        // We need a way to map LINE userId → Supabase user. 
        // For now, we'll store with a special marker and let users claim via the app.
        
        // 6. Save to expenses
        const category = extractedData?.transaction_type || "PERSONAL";
        const expenseData = {
          amount: extractedData?.amount || 0,
          expense_date: extractedData?.date || new Date().toISOString().split('T')[0],
          expense_time: extractedData?.time || null,
          category: category,
          subcategory: extractedData?.subcategory || null,
          description: extractedData?.description || `LINE Receipt ${messageId}`,
          merchant: extractedData?.merchant || null,
          sender: extractedData?.sender || null,
          receiver: extractedData?.receiver || null,
          transaction_id: extractedData?.transaction_id || null,
          transaction_type: extractedData?.transaction_type || null,
          category_group: extractedData?.category_group || null,
          project_tag: extractedData?.project_tag || null,
          transaction_direction: extractedData?.transaction_direction || 'EXPENSE',
          confidence_score: extractedData?.confidence_score || null,
          needs_review: (extractedData?.confidence_score || 0) < 75,
          receipt_url: storagePath,
          // user_id will be set via line_user_mappings
        };

        // Check if we have a LINE → Supabase user mapping
        const { data: mapping } = await supabase
          .from('line_user_mappings')
          .select('supabase_user_id')
          .eq('line_user_id', userId)
          .maybeSingle();

        if (mapping?.supabase_user_id) {
          (expenseData as Record<string, unknown>).user_id = mapping.supabase_user_id;
        }

        const { error: insertError } = await supabase
          .from('expenses')
          .insert(expenseData);

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`);
        }

        // 7. Reply to user
        const amount = extractedData?.amount ? `${extractedData.amount.toLocaleString()} บาท` : 'ไม่ทราบจำนวน';
        const cat = extractedData?.transaction_type || 'ไม่ระบุ';
        const sub = extractedData?.subcategory || '';
        const confidence = extractedData?.confidence_score || 0;
        const reviewFlag = confidence < 75 ? '\n⚠️ ต้องตรวจสอบ (confidence ต่ำ)' : '';

        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, replyToken,
          `✅ บันทึกสำเร็จ!\n💰 ${amount}\n📂 ${cat}${sub ? ' > ' + sub : ''}\n📝 ${extractedData?.description || '-'}${reviewFlag}`
        );

      } catch (err) {
        console.error("Error processing image:", err);
        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, replyToken,
          `❌ เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Unknown error'}\nกรุณาลองใหม่อีกครั้ง`
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function replyToUser(token: string, replyToken: string, message: string) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: message }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Reply failed:", errText);
    }
  } catch (e) {
    console.error("Reply error:", e);
  }
}
