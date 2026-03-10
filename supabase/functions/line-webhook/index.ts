import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-line-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ANALYSIS_PROMPT = `วิเคราะห์สลิปการโอนเงินนี้และจัดหมวดหมู่ตามระบบ:

## ระบบหมวดหมู่ 3 ระดับ:

### 1. TRANSFER (การโอนเงินระหว่างบัญชี)
Subcategories: จ่ายบัตรเครดิต, คืนหนี้/เงินยืม, โอนข้ามบัญชี, ผ่อนชำระ

### 2. BUSINESS (ค่าใช้จ่ายธุรกิจ)
Groups:
- EVENT: งานอีเวนท์ → project_tag = "EVT-ชื่ออีเวนท์"
  Expense Subcategories: Staff, Printing, Venue, Prizes, Transport, Marketing, Refund, Other
  Income Subcategories: Registration, Sponsorship, Product Sales, Other Income
- PROGRAM: โปรแกรมสอน → project_tag = "PROG-ชื่อโปรแกรม"
- VENUE: สนามจักรยาน operations
- ENTITY_KUKANANG: ธุรกิจคู่ขนาน
- ENTITY_BCC: ธุรกิจ BCC
- GENERAL: ค่าใช้จ่ายทั่วไปบริษัท

### 3. PERSONAL (ส่วนตัว)
Subcategories: Food & Drinks, Health & Wellness, Transport, Family & Kids, Self-Development, Donation, Entertainment, Insurance, Shopping, Other

## 🔍 การวิเคราะห์ Memo/Caption (สำคัญมาก!)
ถ้ามี memo ให้ใช้เป็นแหล่งข้อมูลหลักในการจัดหมวดหมู่

### รูปแบบ Memo ที่พบบ่อย:
1. **จ่ายค่าแรงสตาฟ**: "[ชื่อ] [X] วัน [ชื่ออีเวนท์]"
   เช่น "จ๋า 2 วัน Terminal21" → BUSINESS > EVENT > EVT-Terminal21 > Staff
   → staff_name: จ๋า, days_worked: 2, event_name: Terminal21

2. **สตาฟ + ตำแหน่ง**: "[ชื่อ] [ตำแหน่ง] [ชื่ออีเวนท์]"
   เช่น "โบว์ MC Rockstar3" → BUSINESS > EVENT > EVT-Rockstar3 > Staff
   → staff_name: โบว์, event_name: Rockstar3

3. **ของ/บริการสำหรับอีเวนท์**: "[สินค้า] [ชื่ออีเวนท์]"
   เช่น "Poster Rockstar3" → BUSINESS > EVENT > EVT-Rockstar3 > Printing
   → event_name: Rockstar3

4. **Entity**: "คู่ขนาน" → ENTITY_KUKANANG, "BCC" → ENTITY_BCC

## กฎพิเศษ:
- "คู่ขนาน" หรือ "พระราม 2" → ENTITY_KUKANANG
- "BCC" → ENTITY_BCC
- "3BB", "TRUE", "AIS" → BUSINESS > GENERAL > Utilities
- เงินเข้า/ค่าสมัคร/สปอนเซอร์ → transaction_direction = INCOME

## ข้อมูลที่ต้องดึง:
amount, date (YYYY-MM-DD), time, description, merchant, sender, receiver, transaction_id,
transaction_type, category_group, project_tag, subcategory, transaction_direction,
confidence_score (0-100), staff_name, days_worked, event_name

**สำคัญ**: ถ้าหาไม่พบให้ใส่ null, confidence < 75 ถ้าไม่แน่ใจ
**Memo มักให้ข้อมูลที่แม่นยำกว่าสลิป ให้ใช้ memo เป็นหลัก**`;

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
        category_group: { type: ["string", "null"] },
        project_tag: { type: ["string", "null"] },
        subcategory: { type: ["string", "null"] },
        confidence_score: { type: ["number", "null"] },
        transaction_direction: { type: ["string", "null"], enum: ["INCOME", "EXPENSE", null] },
        staff_name: { type: ["string", "null"] },
        days_worked: { type: ["number", "null"] },
        event_name: { type: ["string", "null"] },
      },
      required: ["amount", "date", "description", "transaction_type", "subcategory", "confidence_score", "transaction_direction", "staff_name", "days_worked", "event_name"],
      additionalProperties: false
    }
  }
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
      if (event.type !== "message") continue;

      const userId = event.source?.userId;
      if (!userId) continue;

      // --- Handle TEXT messages: store as pending memo ---
      if (event.message.type === "text") {
        const text = event.message.text?.trim();
        if (!text) continue;

        // Store memo for this user (delete old ones first, keep only latest)
        await supabase.from('line_pending_memos').delete().eq('line_user_id', userId);
        await supabase.from('line_pending_memos').insert({
          line_user_id: userId,
          memo_text: text,
        });

        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
          `📝 รับ memo: "${text}"\n📸 ส่งรูปสลิปตามมาได้เลยครับ ระบบจะใช้ memo นี้ในการจัดหมวดหมู่`);
        continue;
      }

      // --- Handle IMAGE messages ---
      if (event.message.type !== "image") continue;

      const messageId = event.message.id;
      const replyToken = event.replyToken;

      try {
        // 1. Check for pending memo from this user (within last 5 minutes)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: memoData } = await supabase
          .from('line_pending_memos')
          .select('memo_text')
          .eq('line_user_id', userId)
          .gte('created_at', fiveMinAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const memo = memoData?.memo_text || null;

        // Clean up used memo
        if (memo) {
          await supabase.from('line_pending_memos').delete().eq('line_user_id', userId);
        }

        // 2. Download image from LINE
        const imageResponse = await fetch(
          `https://api-data.line.me/v2/bot/message/${messageId}/content`,
          { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
        );

        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBytes = new Uint8Array(imageBuffer);

        // 3. Upload to Storage
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

        // 4. Get signed URL for AI analysis
        const { data: signedData, error: signError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(storagePath, 300);

        if (signError || !signedData?.signedUrl) {
          throw new Error("Failed to create signed URL");
        }

        // 5. Call AI with memo context
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        let promptText = ANALYSIS_PROMPT;
        if (memo) {
          promptText += `\n\n## Memo/Caption ที่ส่งมาพร้อมสลิป:\n"${memo}"\n\nให้ใช้ข้อมูลจาก memo นี้เป็นหลักในการจัดหมวดหมู่และดึง staff_name, days_worked, event_name`;
        }

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
                  { type: "text", text: promptText },
                  { type: "image_url", image_url: { url: signedData.signedUrl } }
                ]
              }
            ],
            tools: [TOOL_SCHEMA],
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

        // 6. Save to expenses
        const category = extractedData?.transaction_type || "PERSONAL";
        const expenseData: Record<string, unknown> = {
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
          staff_name: extractedData?.staff_name || null,
          days_worked: extractedData?.days_worked || null,
          event_name: extractedData?.event_name || null,
          memo_text: memo || null,
        };

        // Check LINE → Supabase user mapping
        const { data: mapping, error: mappingError } = await supabase
          .from('line_user_mappings')
          .select('supabase_user_id')
          .eq('line_user_id', userId)
          .maybeSingle();

        if (mappingError) {
          console.error("Mapping lookup error:", mappingError);
        }

        if (mapping?.supabase_user_id) {
          expenseData.user_id = mapping.supabase_user_id;
        }

        // Check for duplicate transaction_id before inserting
        const txnId = expenseData.transaction_id as string | null;
        if (txnId && mapping?.supabase_user_id) {
          const { data: existingTxn } = await supabase
            .from('expenses')
            .select('id')
            .eq('user_id', mapping.supabase_user_id)
            .eq('transaction_id', txnId)
            .maybeSingle();

          if (existingTxn) {
            console.log("Duplicate transaction_id found:", txnId);
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, replyToken,
              `⚠️ สลิปนี้ถูกบันทึกไปแล้ว\n🔢 เลขที่รายการ: ${txnId}\nไม่ได้บันทึกซ้ำครับ`);
            continue;
          }
        }

        console.log("Inserting expense data:", JSON.stringify(expenseData));

        const { data: insertData, error: insertError } = await supabase
          .from('expenses')
          .insert(expenseData)
          .select();

        if (insertError) {
          console.error("INSERT ERROR:", JSON.stringify(insertError));
          throw new Error(`Insert failed: ${insertError.message} (code: ${insertError.code}, details: ${insertError.details})`);
        }

        console.log("Insert success:", JSON.stringify(insertData));

        // 7. Reply to user with rich info
        const amount = extractedData?.amount ? `${extractedData.amount.toLocaleString()} บาท` : 'ไม่ทราบจำนวน';
        const cat = extractedData?.transaction_type || 'ไม่ระบุ';
        const group = extractedData?.category_group ? ` > ${extractedData.category_group}` : '';
        const sub = extractedData?.subcategory ? ` > ${extractedData.subcategory}` : '';
        const tag = extractedData?.project_tag ? `\n🏷️ ${extractedData.project_tag}` : '';
        const staff = extractedData?.staff_name ? `\n👤 สตาฟ: ${extractedData.staff_name}` : '';
        const days = extractedData?.days_worked ? ` (${extractedData.days_worked} วัน)` : '';
        const eventInfo = extractedData?.event_name ? `\n🎪 อีเวนท์: ${extractedData.event_name}` : '';
        const memoInfo = memo ? `\n📝 Memo: ${memo}` : '';
        const confidence = extractedData?.confidence_score || 0;
        const reviewFlag = confidence < 75 ? '\n⚠️ ต้องตรวจสอบ (confidence ต่ำ)' : '';

        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, replyToken,
          `✅ บันทึกสำเร็จ!\n💰 ${amount}\n📂 ${cat}${group}${sub}${tag}${staff}${days}${eventInfo}${memoInfo}\n📝 ${extractedData?.description || '-'}${reviewFlag}`
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
