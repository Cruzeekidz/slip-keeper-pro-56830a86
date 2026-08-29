import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { parseSlipDateRaw } from "../_shared/slip-date.ts";
import { cleanText, sanitizeExpense } from "../_shared/sanitize.ts";
import { extractEventCodes, resolveEventCode, eventCodePromptSection } from "../_shared/memo-event-code.ts";
import { resolvePaymentCode } from "../_shared/payment-code.ts";
import { parseStaffMessage, looksLikeStaffBilling } from "../_shared/staff-billing.ts";

/** entity มาจากทะเบียนงาน (event_registry) เท่านั้น — ห้าม AI เดา */
async function resolveEntity(
  supabase: any,
  owner: string,
  projectTag: string | null,
  transactionType: string | null,
): Promise<string> {
  if (transactionType === 'PERSONAL') return 'PERSONAL';
  const tag = cleanText(projectTag);
  if (!tag) return 'MENGXIN';
  const { data } = await supabase
    .from('event_registry')
    .select('entity')
    .eq('user_id', owner)
    .eq('project_tag', tag)
    .maybeSingle();
  if (data?.entity) return data.entity as string;
  const t = tag.toUpperCase();
  if (t.startsWith('BCCNEXT-')) return 'EDUCATION';
  if (t.startsWith('KUKAN-')) return 'KUKANANG';
  if (t.startsWith('PROG-')) return 'ACADEMY';
  if (t === 'PERSONAL') return 'PERSONAL';
  return 'MENGXIN';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-line-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Fire-and-forget admin notification (link / new registration / bills / claims)
async function notifyAdminEvent(owner: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin-event`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ owner_user_id: owner, ...payload }),
    });
    if (!res.ok) {
      console.error('notifyAdminEvent failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('notifyAdminEvent failed:', e);
  }
}

// ============================================================
// Cash expense AI parser (text-only, admin)
// ============================================================
const CASH_PROMPT = `วิเคราะห์ข้อความบันทึกค่าใช้จ่ายเงินสดภาษาไทยและสกัดข้อมูลออกมา

ตัวอย่างข้อความ:
- "จ่ายเงินสด ให้นายทูน 150 บาท เป็นค่าน้ำมันเครื่องตัดหญ้า /สนามจักรยาน"
- "จ่ายทิปให้นายทอม คนรถเอาของไปส่งที่ RR /ส่งของให้ดีลเลอร์"
- "จ่ายค่าแท็กซี่ 160 บาท เงินสด"
- "ค่ากาแฟ 80 /Terminal21"

กฎสำคัญ:
- amount: จำนวนเงิน (บาท) — ถ้าหาไม่พบให้ใส่ null
- receiver: ผู้รับเงิน (ชื่อคน/ร้าน) — เช่น "นายทูน", "นายทอม", "ร้านกาแฟ"
- description: คำอธิบายว่าจ่ายค่าอะไร เช่น "ค่าน้ำมันเครื่องตัดหญ้า", "ทิปคนรถ", "ค่าแท็กซี่"
- project_tag: ข้อความหลังเครื่องหมาย "/" เช่น "/สนามจักรยาน" → "สนามจักรยาน", "/Terminal21" → "EVT-Terminal21"
- transaction_type: BUSINESS เป็นค่าเริ่มต้น (ถ้าเกี่ยวกับงาน/บริษัท), PERSONAL ถ้าเป็นเรื่องส่วนตัว
- category_group: GENERAL เป็นค่าเริ่มต้น, EVENT ถ้ามี project_tag เป็นชื่ออีเวนท์, VENUE ถ้าเกี่ยวกับสนาม
- subcategory: เดาจาก description เช่น ค่าน้ำมัน→Transport, ทิป→Other, แท็กซี่→Transport, กาแฟ→Food
- transaction_direction: EXPENSE (เกือบทุกกรณี)
- confidence_score: 0-100 ตามความมั่นใจ`;

const CASH_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "extract_cash_expense",
    description: "Extract cash expense data from Thai text",
    parameters: {
      type: "object",
      properties: {
        amount: { type: ["number", "null"] },
        receiver: { type: ["string", "null"] },
        description: { type: ["string", "null"] },
        project_tag: { type: ["string", "null"] },
        transaction_type: { type: ["string", "null"], enum: ["BUSINESS", "PERSONAL", null] },
        category_group: { type: ["string", "null"] },
        subcategory: { type: ["string", "null"] },
        confidence_score: { type: ["number", "null"] },
      },
      required: ["amount", "description", "transaction_type", "subcategory", "confidence_score"],
      additionalProperties: false,
    },
  },
};

// Detect cash expense intent in Thai text
function looksLikeCashExpense(text: string): boolean {
  const t = text.toLowerCase();
  // Must contain a keyword AND a number
  const hasKeyword = /จ่ายเงินสด|จ่ายทิป|ทิป|จ่ายค่า|ค่า\s*\S+\s*\d|เงินสด/.test(t);
  const hasNumber = /\d{2,}/.test(t);
  return hasKeyword && hasNumber;
}

// Detect billing/receipt intent
function parseBillingIntent(text: string): { kind: 'billing' | 'receipt'; amount: number | null; description: string } | null {
  const m = text.match(/^(วางบิล|ใบวางบิล|เรียกเก็บ|invoice|ใบเสร็จ|ใบเสร่จ|receipt)\s*(.*)$/i);
  if (!m) return null;
  const kindWord = m[1].toLowerCase();
  const kind: 'billing' | 'receipt' =
    /ใบเสร็จ|ใบเสร่จ|receipt/.test(kindWord) ? 'receipt' : 'billing';
  const rest = (m[2] || '').trim();
  const amtMatch = rest.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : null;
  const description = amtMatch ? rest.replace(amtMatch[0], '').trim() : rest;
  return { kind, amount, description };
}

function getHelpMessage(): string {
  return `📖 วิธีใช้งาน LINE Bot:

1️⃣ ส่งใบวางบิล/ใบแจ้งหนี้:
   พิมพ์: วางบิล [จำนวน] [คำอธิบาย]
   เช่น: วางบิล 5000 ค่าออกแบบโปสเตอร์
   👉 แล้วแนบรูปใบวางบิลตามมาภายใน 10 นาที

2️⃣ ส่งใบเสร็จเรียกเงินคืน:
   พิมพ์: ใบเสร็จ [จำนวน] [คำอธิบาย]
   เช่น: ใบเสร็จ 350 ค่าเดินทาง
   👉 แล้วแนบรูปใบเสร็จตามมา

3️⃣ ส่งสลิปโอนเงินปกติ:
   ส่งรูปสลิปได้เลย (พิมพ์ memo ก่อนส่งรูปก็ได้)

❓ พิมพ์ "help" เพื่อดูข้อความนี้อีกครั้ง`;
}

function getAdminHelpMessage(): string {
  return getHelpMessage() + `

👑 สำหรับแอดมิน:

4️⃣ บันทึกเงินสด (พิมพ์อย่างเดียว ไม่ต้องแนบรูป):
   พิมพ์: จ่ายเงินสด ให้[ผู้รับ] [จำนวน] บาท เป็น[รายการ] /[งาน]
   เช่น: จ่ายเงินสด ให้นายทูน 150 บาท เป็นค่าน้ำมันเครื่องตัดหญ้า /สนามจักรยาน
   หรือ: จ่ายค่าแท็กซี่ 160 บาท เงินสด`;
}

function getUserGuideFlex(isAdmin: boolean): Record<string, unknown> {
  const LIFF_BASE = "https://liff.line.me/2008893199-xaJITz5y";
  const sectionHeader = (text: string, color: string) => ({
    type: "text", text, weight: "bold", size: "md", color, margin: "md",
  });
  const item = (label: string, detail: string) => ({
    type: "box", layout: "vertical", margin: "sm", spacing: "xs",
    contents: [
      { type: "text", text: label, size: "sm", weight: "bold", color: "#333333", wrap: true },
      { type: "text", text: detail, size: "xs", color: "#666666", wrap: true },
    ],
  });

  const bodyContents: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: "ยินดีต้อนรับสู่ Cruzee Finance! เลือกหัวข้อด้านล่างเพื่อดูวิธีใช้งานแต่ละกลุ่ม",
      size: "xs", color: "#888888", wrap: true,
    },
    { type: "separator", margin: "md" },

    sectionHeader("👥 สำหรับทีมงาน (Staff)", "#2563EB"),
    item("1. ลงทะเบียน/ผูก LINE", "กดปุ่ม 'ลงทะเบียน/ผูก LINE' ในเมนูล่าง → กรอกเบอร์โทร 10 หลัก ระบบจะผูก LINE ให้อัตโนมัติ"),
    item("2. วางบิลค่าจ้าง/ค่าใช้จ่าย", "พิมพ์ในแชต: 'วางบิล 5000 ค่าออกแบบ' → ส่งรูปใบเสร็จ/หลักฐานภายใน 10 นาที"),
    item("3. ส่งใบเสร็จเรียกเงินคืน", "พิมพ์: 'ใบเสร็จ 350 ค่าเดินทาง' → ส่งรูป"),
    item("4. เช็คสถานะการจ่ายเงิน", "เปิดเมนู 'Portal' → ดูรายการที่รออนุมัติ/จ่ายแล้ว"),

    { type: "separator", margin: "md" },

    sectionHeader("🏢 สำหรับคู่ค้า (Vendor)", "#059669"),
    item("1. ลงทะเบียนคู่ค้า", "กดเมนู 'ลงทะเบียนคู่ค้า' → กรอกชื่อบริษัท เลขผู้เสียภาษี เบอร์โทร 10 หลัก"),
    item("2. ส่งใบแจ้งหนี้/บิล", "อัปโหลดบิลผ่าน Portal หรือส่งรูปบิลในแชต LINE นี้"),
    item("3. อัปโหลด ภพ.20", "เข้า Portal → หน้าคู่ค้า → อัปโหลดเอกสาร ภพ.20 เพื่อใช้ลดภาษี ณ ที่จ่าย"),

    { type: "separator", margin: "md" },

    sectionHeader("⌨️ คำสั่งพิมพ์ในแชต", "#DC2626"),
    item("วางบิล [จำนวน] [คำอธิบาย]", "เช่น: วางบิล 5000 ค่าออกแบบโปสเตอร์"),
    item("ใบเสร็จ [จำนวน] [คำอธิบาย]", "เช่น: ใบเสร็จ 350 ค่าเดินทาง"),
    item("ส่งรูปสลิปได้เลย", "ระบบ AI จะอ่านสลิปและบันทึกค่าใช้จ่ายให้อัตโนมัติ"),
    item("help / คู่มือ", "ดูข้อความนี้อีกครั้ง"),
  ];

  if (isAdmin) {
    bodyContents.push(
      { type: "separator", margin: "md" },
      sectionHeader("👑 สำหรับแอดมิน", "#9333EA"),
      item("จ่ายเงินสด", "เช่น: 'จ่ายเงินสด ให้นายทูน 150 บาท เป็นค่าน้ำมัน /สนามจักรยาน'"),
      item("เปิด Dashboard", "เปิด Portal → จัดการทีมงาน คู่ค้า บิล และรายงาน WHT"),
    );
  }

  return {
    type: "bubble",
    size: "giga",
    header: {
      type: "box", layout: "vertical", paddingAll: "lg",
      backgroundColor: "#1E40AF",
      contents: [
        { type: "text", text: "📖 คู่มือการใช้งาน", weight: "bold", size: "xl", color: "#FFFFFF" },
        { type: "text", text: "Cruzee Finance LINE Bot", size: "sm", color: "#BFDBFE", margin: "xs" },
      ],
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg",
      contents: bodyContents,
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg",
      contents: [
        {
          type: "button", style: "primary", color: "#1E40AF", height: "sm",
          action: { type: "uri", label: "🔗 เปิด Portal", uri: `${LIFF_BASE}?view=quick-link` },
        },
        {
          type: "text",
          text: "หากพบปัญหา ติดต่อแอดมินได้ในแชตนี้",
          size: "xxs", color: "#888888", align: "center", margin: "sm", wrap: true,
        },
      ],
    },
  };
}

async function parseCashExpenseWithAI(text: string, apiKey: string): Promise<any | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: CASH_PROMPT },
          { role: "user", content: text },
        ],
        tools: [CASH_TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_cash_expense" } },
      }),
    });
    if (!res.ok) {
      console.error("Cash AI parse failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;
    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.error("Cash AI parse error:", e);
    return null;
  }
}

const ANALYSIS_PROMPT = `วิเคราะห์สลิปการโอนเงินนี้และจัดหมวดหมู่ตามระบบ:

## ระบบหมวดหมู่ 3 ระดับ:

### 1. TRANSFER (การโอนเงินระหว่างบัญชี)
Subcategories: จ่ายบัตรเครดิต, คืนหนี้/เงินยืม, โอนข้ามบัญชี, ผ่อนชำระ

### 2. BUSINESS (ค่าใช้จ่ายธุรกิจ) — แบ่งเป็น 3 Entity:

#### Entity 1: ธุรกิจหลัก
Groups:
- EVENT: งานอีเวนท์ → project_tag = "EVT-ชื่ออีเวนท์"
  Expense Subcategories: Staff, Printing, Venue, Prizes, Transport, Marketing, Refund, Other
  Income Subcategories: Registration, Sponsorship, Product Sales, Other Income
- PROGRAM: โปรแกรมสอน → project_tag = "PROG-ชื่อโปรแกรม"
- VENUE: สนามจักรยาน operations
- GENERAL: ค่าใช้จ่ายทั่วไปบริษัท

#### Entity 2: BCC Next (ธุรกิจแยก)
- category_group = "ENTITY_BCC_NEXT"
- project_tag = "BCCNEXT-ชื่อโครงการ"
- โครงการย่อย: Peca Bridge, EngineerX 2025 T1/T2, Play Box 2026
- Subcategories: Staff, Venue, Equipment, Marketing, Printing, Prizes, Transport, Utilities, Other

#### Entity 3: คู่ขนาน (ธุรกิจแยก)
- category_group = "ENTITY_KUKANANG"
- Subcategories: Staff, Venue, Equipment, Marketing, Utilities, Other

### 3. PERSONAL (ส่วนตัว)
Subcategories: Food & Drinks, Health & Wellness, Transport, Family & Kids, Self-Development, Donation, Entertainment, Insurance, Shopping, Other

## 🔍 การวิเคราะห์ Memo/Caption (สำคัญมาก!)
ถ้ามี memo ให้ใช้เป็นแหล่งข้อมูลหลักในการจัดหมวดหมู่

### 📌 รูปแบบ Memo มาตรฐาน:

#### A. EVENT patterns (ทั้งหมดเป็น BUSINESS > EVENT):
1. **Staff**: "[ชื่อ] [X] วัน [อีเวนท์]" หรือ "staff [อีเวนท์]"
   เช่น "จ๋า 2 วัน Terminal21" → Staff, staff_name: จ๋า, days_worked: 2
2. **Staff + ตำแหน่ง**: "[ชื่อ] [ตำแหน่ง] [อีเวนท์]"
   เช่น "โบว์ MC Rockstar3" → Staff, staff_name: โบว์
3. **Prizes**: "medals/เหรียญ/trophy/ถ้วย/รางวัล [อีเวนท์]"
4. **Printing**: "poster/ป้าย/เสื้อ/banner/สติกเกอร์ [อีเวนท์]"
5. **Venue**: "venue/เช่าที่/ค่าสถานที่ [อีเวนท์]"
6. **Transport**: "transport/ขนส่ง/โลจิสติกส์/ค่ารถ [อีเวนท์]"
7. **Marketing**: "ads/โฆษณา/marketing/boost [อีเวนท์]"
8. **Refund**: "refund/คืนเงิน/คืนค่าสมัคร [อีเวนท์]"

#### B. BCC Next patterns (BUSINESS > ENTITY_BCC_NEXT):
9. "[subcategory] BCC" หรือ "Peca Bridge" หรือ "EngineerX" หรือ "Play Box" → ENTITY_BCC_NEXT
   เช่น "staff Peca Bridge" → ENTITY_BCC_NEXT, project_tag: BCCNEXT-PecaBridge

#### C. คู่ขนาน patterns (BUSINESS > ENTITY_KUKANANG):
10. "[subcategory] คู่ขนาน" หรือ "พระราม 2" → ENTITY_KUKANANG

#### D. ชื่อโครงการที่รู้จัก (ระบบจะ normalize อัตโนมัติจาก event_registry):
- Terminal21 / T21 → EVT-Terminal21
- KMT + เลข → EVT-KMT41
- Rockstar + เลข → EVT-Rockstar3
- Westville → EVT-Westville
- Promenade / พรอมมานาด → EVT-Promenade
- Peca Bridge → BCCNEXT-PecaBridge (BCC Next)
- EngineerX → BCCNEXT-EngineerX25-T1 หรือ T2
- Play Box → BCCNEXT-PlayBox2026

## กฎพิเศษ:
- "คู่ขนาน" หรือ "พระราม 2" → ENTITY_KUKANANG
- "BCC" หรือ "Peca Bridge" หรือ "EngineerX" หรือ "Play Box" → ENTITY_BCC_NEXT
- "3BB", "TRUE", "AIS" → BUSINESS > GENERAL > Utilities
- เงินเข้า/ค่าสมัคร/สปอนเซอร์ → transaction_direction = INCOME

## ข้อมูลที่ต้องดึง:
amount, date_raw (ข้อความวันที่ดิบบนสลิป ห้ามแปลง), date (YYYY-MM-DD), time, description, merchant, sender, receiver, transaction_id,
transaction_type, category_group, project_tag, subcategory, transaction_direction,
confidence_score (0-100), staff_name, days_worked, event_name

## 📅 กฎการอ่านวันที่ (สำคัญที่สุด — ห้ามผิด)
1. **date_raw** = ข้อความวันที่บนสลิปแบบดิบ ๆ ห้ามแปลง ห้ามจัดรูปแบบ เช่น "23/04/26", "1 ก.พ. 67", "26 ส.ค. 2569" ถ้าอ่านไม่เจอ = null
2. สลิปไทยเรียง **วัน → เดือน → ปี** เสมอ เลขกลุ่มแรกคือ **วันที่** ห้ามตีความเป็นปีเด็ดขาด
3. ปี 2 หลัก: มากกว่าเลขสองหลักท้ายของปี ค.ศ. ปัจจุบัน = พ.ศ. (ลบ 543) ถ้าน้อยกว่าหรือเท่ากัน = ค.ศ.
   (ปีนี้ 2026 → "68" = 2025, "26" = 2026, "24" = 2024) · ปี 4 หลัก ≥ 2500 → ลบ 543
4. **ห้ามเดา** ถ้าอ่านวันที่ไม่ชัด → date = null, confidence_score < 70

**สำคัญ**: ถ้าหาไม่พบให้ใส่ null, confidence < 75 ถ้าไม่แน่ใจ
**Memo มักให้ข้อมูลที่แม่นยำกว่าสลิป ให้ใช้ memo เป็นหลัก**` + eventCodePromptSection();

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
        date_raw: { type: ["string", "null"] },
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
        slip_memo: { type: ["string", "null"], description: "ข้อความในช่องบันทึกช่วยจำบนสลิปแบบดิบ" },
        event_codes: { type: "array", items: { type: "string" }, description: "รหัสงานที่ขึ้นต้นด้วย @ * # แบบตรงตัว" },
      },
      required: ["amount", "date", "date_raw", "description", "transaction_type", "subcategory", "confidence_score", "transaction_direction", "staff_name", "days_worked", "event_name", "slip_memo", "event_codes"],
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

    // Process events in the background so LINE gets an immediate 200 ACK.
    // Without this, sending many slips at once (e.g. 50) keeps the webhook
    // busy for minutes and LINE / the user perceive the bot as unresponsive.
    const processEvents = async () => {
    for (const event of events) {
      // ===== Handle follow event (user added bot as friend) =====
      if (event.type === "follow") {
        const followUserId = event.source?.userId;
        if (!followUserId) continue;
        let followDisplayName: string | null = null;
        try {
          const pr = await fetch(`https://api.line.me/v2/bot/profile/${followUserId}`, {
            headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
          });
          if (pr.ok) {
            const p = await pr.json();
            followDisplayName = p.displayName || null;
          }
        } catch (_e) { /* ignore */ }

        await supabase.from('line_user_roles').upsert({
          line_user_id: followUserId,
          display_name: followDisplayName,
          role: 'member',
        }, { onConflict: 'line_user_id' });

        // Try auto-link by display name (staff_name → nickname → company_name)
        if (followDisplayName) {
          const tryLink = async (table: string, col: string) => {
            const { data } = await supabase
              .from(table)
              .select('id, user_id')
              .is('line_user_id', null)
              .ilike(col, followDisplayName!)
              .limit(2);
            if (data && data.length === 1) {
              await supabase.from(table).update({ line_user_id: followUserId } as any).eq('id', data[0].id);
              return true;
            }
            return false;
          };
          (await tryLink('staff_profiles', 'staff_name'))
            || (await tryLink('staff_profiles', 'nickname'))
            || (await tryLink('vendor_profiles', 'company_name'));
        }

        if (event.replyToken) {
          await replyFlexToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, getWelcomeFlex(followDisplayName));
        } else {
          try {
            await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
              body: JSON.stringify({ to: followUserId, messages: [getWelcomeFlex(followDisplayName)] }),
            });
          } catch (_e) { /* ignore */ }
        }
        continue;
      }

      if (event.type !== "message") continue;

      const userId = event.source?.userId;
      if (!userId) continue;

      // --- Check user role ---
      const { data: roleData } = await supabase
        .from('line_user_roles')
        .select('role, display_name')
        .eq('line_user_id', userId)
        .maybeSingle();

      const userRole = roleData?.role || null;

      // If user has no role, register them and reply with greeting
      if (!userRole) {
        // Get LINE display name via profile API
        let lineDisplayName: string | null = null;
        try {
          const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            lineDisplayName = profile.displayName || null;
          }
        } catch (e) {
          console.error("Failed to get LINE profile:", e);
        }

        // Save to line_user_roles as 'member'
        await supabase.from('line_user_roles').upsert({
          line_user_id: userId,
          display_name: lineDisplayName,
          role: 'member',
        }, { onConflict: 'line_user_id' });

        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
          `สวัสดีค่ะ ระบบจดจำบัญชีของคุณแล้ว${lineDisplayName ? ` (${lineDisplayName})` : ''} 😊`);
        continue;
      }

      // --- Handle TEXT messages (all roles) ---
      if (event.message.type === "text") {
        const text = event.message.text?.trim();
        if (!text) continue;

        // --- Active conversation state (Quick Reply responses or step-by-step expense entry) ---
        const convState = await getConvState(supabase, userId);
        if (convState && /^(ยกเลิก|cancel)$/i.test(text)) {
          await clearConvState(supabase, userId);
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, '✅ ยกเลิกการบันทึกแล้ว');
          continue;
        }
        if (convState && !/^(help|วิธีใช้|menu|เมนู|คู่มือ)$/i.test(text)) {
          if (convState.state === 'awaiting_vendor_shop_name') {
            const shopName = text.slice(0, 120);
            const { data: newVendor } = await supabase.from('vendor_profiles').insert({
              user_id: convState.owner,
              vendor_type: 'company',
              company_name: shopName,
              line_user_id: userId,
              is_active: true,
            } as any).select('id').single();
            if (newVendor?.id && convState.draft_data?.invoice_id) {
              await supabase.from('vendor_invoices')
                .update({ vendor_id: newVendor.id, submitted_via_line_display_name: shopName } as any)
                .eq('id', convState.draft_data.invoice_id);
            }
            await clearConvState(supabase, userId);
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `✅ บันทึกชื่อ "${shopName}" แล้วค่ะ ครั้งต่อไปส่งรูปบิลเข้ามาได้เลย ไม่ต้องพิมพ์อะไรอีก 🙏`);
            continue;
          }
          if (typeof convState.state === 'string' && convState.state.startsWith('awaiting_staff_')) {
            const handledStaff = await handleStaffBillingConvReply(supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId, convState, text);
            if (handledStaff) continue;
          }
          if (typeof convState.state === 'string' && convState.state.startsWith('awaiting_register_')) {
            const handled = await handleRegistrationConvReply(supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId, convState, text);
            if (handled) continue;
          }
          const handled = await handleExpenseConvReply(supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId, convState, text);
          if (handled) continue;
        }

        // --- Help / User guide command (everyone) ---
        if (/^(help|วิธีใช้|\?|？|menu|เมนู|คู่มือ|ดูคู่มือ|ดูคู่มือการใช้งาน|guide|manual)$/i.test(text)) {
          await replyFlexToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, getUserGuideFlex(userRole === 'admin'));
          continue;
        }

        // --- Registration intent (unlinked users) ---
        if (/^(ลงทะเบียน|สมัคร|register|signup|sign\s*up)$/i.test(text)) {
          const existing = await resolveLineUserProfile(supabase, userId);
          if (existing) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `✅ บัญชีของคุณผูกกับระบบแล้ว (${existing.displayName || existing.kind})\nหากต้องการเปลี่ยนข้อมูล กรุณาติดต่อแอดมิน`);
            continue;
          }
          const owner = await getDefaultOwner(supabase);
          if (!owner) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, '❌ ระบบยังไม่พร้อมรับสมัคร กรุณาติดต่อแอดมิน');
            continue;
          }
          await setConvState(supabase, userId, owner, 'awaiting_register_phone', {});
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            '📱 กรุณาพิมพ์เบอร์โทรของคุณ (เช่น 0812345678)\n\nระบบจะค้นหาบัญชีให้อัตโนมัติ ถ้ายังไม่เคยมี จะให้สมัครใหม่ในแชตนี้เลย\n\nพิมพ์ "ยกเลิก" เพื่อยกเลิก');
          continue;
        }

        // --- Bare phone number from unlinked user → trigger registration phone flow ---
        {
          const digits = text.replace(/[^0-9]/g, '');
          if (digits.length >= 9 && digits.length <= 10 && /^[0-9\s\-+()]+$/.test(text)) {
            const existing = await resolveLineUserProfile(supabase, userId);
            if (!existing) {
              const owner = await getDefaultOwner(supabase);
              if (owner) {
                await setConvState(supabase, userId, owner, 'awaiting_register_phone', {});
                const handled = await handleRegistrationConvReply(
                  supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId,
                  { state: 'awaiting_register_phone', owner, draft_data: {} } as any, text);
                if (handled) continue;
              }
            }
          }
        }

        // --- Linking code: ผูก:XXXXXX (everyone) ---
        const linkMatch = text.match(/^ผูก[:\s]?\s*(\d{6})$/);
        if (linkMatch) {
          const code = linkMatch[1];
          const { data: linkCode, error: linkErr } = await supabase
            .from('link_codes')
            .select('id, user_id, expires_at, used')
            .eq('code', code)
            .eq('used', false)
            .maybeSingle();

          if (linkErr || !linkCode) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ รหัสผูกบัญชี "${code}" ไม่ถูกต้องหรือหมดอายุแล้ว\nกรุณาสร้างรหัสใหม่จากหน้าเว็บ`);
            continue;
          }

          if (new Date(linkCode.expires_at) < new Date()) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `⏰ รหัสผูกบัญชี "${code}" หมดอายุแล้ว\nกรุณาสร้างรหัสใหม่จากหน้าเว็บ`);
            continue;
          }

          let lineDisplayName: string | null = roleData?.display_name || null;
          if (!lineDisplayName) {
            try {
              const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
                headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
              });
              if (profileRes.ok) {
                const profile = await profileRes.json();
                lineDisplayName = profile.displayName || null;
              }
            } catch (_e) { /* ignore */ }
          }

          await supabase.from('line_user_mappings').delete().eq('supabase_user_id', linkCode.user_id);

          const { error: mapErr } = await supabase.from('line_user_mappings').insert({
            line_user_id: userId,
            supabase_user_id: linkCode.user_id,
            display_name: lineDisplayName,
          });

          if (mapErr) {
            console.error("Link mapping error:", mapErr);
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ เกิดข้อผิดพลาดในการผูกบัญชี กรุณาลองใหม่`);
            continue;
          }

          await supabase.from('link_codes').update({ used: true }).eq('id', linkCode.id);

          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            `✅ ผูกบัญชีสำเร็จ!${lineDisplayName ? ` (${lineDisplayName})` : ''}\n🔗 LINE ของคุณเชื่อมต่อกับระบบ Cruzee Finance แล้ว\n📸 สามารถส่งสลิปเพื่อบันทึกค่าใช้จ่ายได้เลยครับ`);
          continue;
        }

        // --- Billing/Receipt intent (everyone — guides waiting for image) ---
        const billingIntent = parseBillingIntent(text);
        if (billingIntent) {
          // Save pending billing for 10 minutes
          await supabase.from('line_pending_billings').delete().eq('line_user_id', userId);
          const { error: insErr } = await supabase.from('line_pending_billings').insert({
            line_user_id: userId,
            kind: billingIntent.kind,
            amount: billingIntent.amount,
            description: billingIntent.description || null,
          });

          if (insErr) {
            console.error("pending billing insert error:", insErr);
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ เกิดข้อผิดพลาด กรุณาลองใหม่`);
            continue;
          }

          const kindLabel = billingIntent.kind === 'billing' ? 'ใบวางบิล' : 'ใบเสร็จ';
          const amtText = billingIntent.amount
            ? `\n💰 จำนวน: ${billingIntent.amount.toLocaleString()} บาท`
            : '\n⚠️ ไม่พบจำนวนเงิน — แอดมินจะตรวจตอนอนุมัติ';
          const descText = billingIntent.description
            ? `\n📝 ${billingIntent.description}`
            : '';
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            `📥 รับ${kindLabel}แล้ว${amtText}${descText}\n\n📸 กรุณาแนบรูป${kindLabel}ตามมาภายใน 10 นาที\n(ไม่ต้องระบุชื่ออีเวนท์ — แอดมินจะใส่ตอนอนุมัติ)`);
          continue;
        }

        // --- แจ้งค่าจ้าง / สำรองจ่าย ด้วยการพิมพ์ (ทีมงาน & ฟรีแลนซ์) ---
        if (userRole !== 'admin') {
          const staffProfile = await resolveLineUserProfile(supabase, userId);
          if (staffProfile && staffProfile.kind === 'staff' && looksLikeStaffBilling(text)) {
            const started = await startStaffBillingFlow(
              supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId, staffProfile, text);
            if (started) continue;
          }
          // ยังไม่ผูกบัญชี → ส่งลิงก์ผูกบัญชีให้ก่อน
          if (!staffProfile) {
            await replyFlexToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, getLinkAccountFlex(text));
            continue;
          }
        }

        // --- Conversational expense entry (linked staff/vendor types expense text) ---
        if (userRole !== 'admin') {
          const profile = await resolveLineUserProfile(supabase, userId);
          if (profile && (profile.kind === 'staff' || profile.kind === 'vendor') && looksLikeExpenseText(text)) {
            const LOVABLE_API_KEY_X = Deno.env.get("LOVABLE_API_KEY");
            if (LOVABLE_API_KEY_X) {
              const parsed = await parseStaffExpenseAI(text, LOVABLE_API_KEY_X);
              if (parsed && parsed.amount && parsed.amount > 0) {
                await startExpenseConversation(supabase, LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, userId, profile, parsed, text);
                continue;
              }
            }
          }
        }

        // --- ADMIN ONLY from here ---
        if (userRole !== 'admin') {
          // Non-admin: store as memo for image, or guide them
          await supabase.from('line_pending_memos').delete().eq('line_user_id', userId);
          await supabase.from('line_pending_memos').insert({
            line_user_id: userId,
            memo_text: text,
          });
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            `📝 รับข้อความแล้ว: "${text}"\n📸 ส่งรูปใบวางบิล/ใบเสร็จตามมาได้เลย\n\n💡 พิมพ์ "help" เพื่อดูวิธีใช้งาน`);
          continue;
        }

        if (text.includes('flowaccount.com')) {
          // Find the user's supabase ID
          const { data: mapping } = await supabase
            .from('line_user_mappings')
            .select('supabase_user_id')
            .eq('line_user_id', userId)
            .maybeSingle();

          if (!mapping?.supabase_user_id) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ ยังไม่ได้ผูกบัญชี กรุณาผูกบัญชีก่อน`);
            continue;
          }

          // Extract URL from text
          const urlMatch = text.match(/(https?:\/\/[^\s]+flowaccount\.com[^\s]*)/i);
          const flowUrl = urlMatch ? urlMatch[1] : text.trim();

          // Find WHT records without flowaccount_url for this user
          const { data: pendingCerts } = await supabase
            .from('wht_certificates')
            .select('id, payee_name, total_gross, total_tax, issue_date')
            .eq('user_id', mapping.supabase_user_id)
            .is('flowaccount_url', null)
            .order('issue_date', { ascending: false })
            .limit(10);

          if (!pendingCerts || pendingCerts.length === 0) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `⚠️ ไม่พบรายการหัก ณ ที่จ่ายที่รอลิงก์\nกรุณาบันทึกรายการก่อนที่หน้าเว็บ`);
            continue;
          }

          if (pendingCerts.length === 1) {
            // Auto-match: only one pending record
            const cert = pendingCerts[0];
            await supabase
              .from('wht_certificates')
              .update({ flowaccount_url: flowUrl } as any)
              .eq('id', cert.id);

            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `✅ บันทึกลิงก์ FlowAccount สำเร็จ!\n👤 ${cert.payee_name}\n💰 ${Number(cert.total_gross).toLocaleString()} บาท\n🔗 ${flowUrl}`);
            continue;
          }

          // Multiple pending: try to match by payee name in the message text
          const textLower = text.toLowerCase();
          const matched = pendingCerts.find(c => textLower.includes(c.payee_name.toLowerCase()));

          if (matched) {
            await supabase
              .from('wht_certificates')
              .update({ flowaccount_url: flowUrl } as any)
              .eq('id', matched.id);

            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `✅ บันทึกลิงก์ FlowAccount สำเร็จ!\n👤 ${matched.payee_name}\n💰 ${Number(matched.total_gross).toLocaleString()} บาท\n🔗 ${flowUrl}`);
            continue;
          }

          // Can't auto-match: list pending records
          const listText = pendingCerts.map((c, i) =>
            `${i + 1}. ${c.payee_name} - ${Number(c.total_gross).toLocaleString()} บาท (${c.issue_date})`
          ).join('\n');

          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            `🔍 พบหลายรายการที่รอลิงก์:\n${listText}\n\n💡 กรุณาวางลิงก์พร้อมชื่อคู่ค้า หรือวางลิงก์ที่หน้าเว็บแทน`);
          continue;
        }

        // --- Cash expense (admin only, text-only, no image needed) ---
        if (looksLikeCashExpense(text)) {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ ระบบ AI ไม่พร้อม กรุณาลองใหม่`);
            continue;
          }

          const { data: mapping } = await supabase
            .from('line_user_mappings')
            .select('supabase_user_id')
            .eq('line_user_id', userId)
            .maybeSingle();

          if (!mapping?.supabase_user_id) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ ยังไม่ได้ผูกบัญชี กรุณาผูกบัญชีก่อน`);
            continue;
          }

          const parsed = await parseCashExpenseWithAI(text, LOVABLE_API_KEY);
          if (!parsed || !parsed.amount || parsed.amount <= 0) {
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `🤔 ไม่สามารถสกัดข้อมูลจากข้อความได้\nลองพิมพ์ในรูปแบบ:\n"จ่ายเงินสด ให้[ผู้รับ] [จำนวน] บาท เป็น[รายการ] /[งาน]"`);
            continue;
          }

          const txType = cleanText(parsed.transaction_type) || 'BUSINESS';
          const catGroup = txType === 'BUSINESS' ? (cleanText(parsed.category_group) || 'GENERAL') : null;
          const category = txType === 'BUSINESS' ? `BUSINESS > ${catGroup}` : txType;
          const cashTag = cleanText(parsed.project_tag);
          const cashEntity = await resolveEntity(supabase, mapping.supabase_user_id, cashTag, txType);

          const { data: inserted, error: insErr } = await supabase.from('expenses').insert(sanitizeExpense({
            user_id: mapping.supabase_user_id,
            amount: parsed.amount,
            expense_date: new Date().toISOString().split('T')[0],
            description: cleanText(parsed.description) || text,
            receiver: cleanText(parsed.receiver),
            category,
            subcategory: cleanText(parsed.subcategory),
            transaction_type: txType,
            category_group: catGroup,
            project_tag: cashTag,
            entity: cashEntity,
            transaction_direction: 'EXPENSE',
            confidence_score: parsed.confidence_score || 75,
            needs_review: (parsed.confidence_score || 0) < 75 || (catGroup === 'EVENT' && !cashTag),
            is_cash: true,
            receipt_url: null,
            memo_text: text,
          }) as any).select('id').single();

          if (insErr) {
            console.error("Cash expense insert error:", insErr);
            await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
              `❌ บันทึกไม่สำเร็จ: ${insErr.message}`);
            continue;
          }

          const editUrl = `https://slip-keeper-pro.lovable.app/?edit=${inserted.id}`;
          const tagText = parsed.project_tag ? `\n🏷️ ${parsed.project_tag}` : '';
          const recvText = parsed.receiver ? `\n👤 ${parsed.receiver}` : '';
          await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
            `✅ บันทึกเงินสดสำเร็จ!\n💰 ${parsed.amount.toLocaleString()} บาท${recvText}\n📝 ${parsed.description || '-'}${tagText}\n📂 ${category}${parsed.subcategory ? ' > ' + parsed.subcategory : ''}\n\n✏️ แก้ไข: ${editUrl}`);
          continue;
        }

        // --- Handle TEXT messages as pending memo ---
        await supabase.from('line_pending_memos').delete().eq('line_user_id', userId);
        await supabase.from('line_pending_memos').insert({
          line_user_id: userId,
          memo_text: text,
        });

        await replyToUser(LINE_CHANNEL_ACCESS_TOKEN, event.replyToken,
          `📝 รับ memo: "${text}"\n📸 ส่งรูปสลิปตามมาได้เลยครับ ระบบจะใช้ memo นี้ในการจัดหมวดหมู่`);
        continue;
      }

      // --- Handle IMAGE and FILE (PDF) messages ---
      const isImage = event.message.type === "image";
      const isFile = event.message.type === "file";
      const isPDF = isFile && (event.message.fileName?.toLowerCase().endsWith('.pdf') || event.message.contentType === 'application/pdf');

      if (!isImage && !isPDF) continue;

      const messageId = event.message.id;
      const replyToken = event.replyToken;

      try {
        // ===== ID card capture: linked staff/vendor sends image and profile has no id_card_url =====
        if (isImage) {
          const idProfile = await resolveLineUserProfile(supabase, userId);
          if (idProfile && (idProfile.kind === 'staff' || idProfile.kind === 'vendor') && !idProfile.profile?.id_card_url) {
            const { data: pendBill } = await supabase.from('line_pending_billings')
              .select('id').eq('line_user_id', userId).gt('expires_at', new Date().toISOString()).maybeSingle();
            if (!pendBill) {
              const LK = Deno.env.get("LOVABLE_API_KEY");
              const cr = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`,
                { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } });
              if (cr.ok && LK) {
                const bytes = new Uint8Array(await cr.arrayBuffer());
                const idPath = `id-cards/${idProfile.owner}/${idProfile.profileId}/${Date.now()}.jpg`;
                const { error: upErr } = await supabase.storage.from('documents')
                  .upload(idPath, bytes, { contentType: 'image/jpeg', upsert: false });
                if (!upErr) {
                  const { data: signed } = await supabase.storage.from('documents').createSignedUrl(idPath, 300);
                  const ocr = signed?.signedUrl ? await ocrIdCard(signed.signedUrl, LK) : null;
                  if (ocr?.id_number && /^\d{13}$/.test(ocr.id_number)) {
                    const tbl = idProfile.kind === 'staff' ? 'staff_profiles' : 'vendor_profiles';
                    await supabase.from(tbl).update({
                      id_card_url: idPath,
                      id_card_number: ocr.id_number,
                      id_card_verified_at: new Date().toISOString(),
                    } as any).eq('id', idProfile.profileId);
                    await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
                      `✅ บันทึกสำเนาบัตรประชาชนแล้ว\n👤 ${ocr.full_name || '-'}\n🆔 ${formatThaiId(ocr.id_number)}${ocr.expiry ? `\n📅 หมดอายุ ${ocr.expiry}` : ''}\n\nขอบคุณค่ะ! 🙏`);
                    continue;
                  }
                  // Not an ID card — clean up and fall through to existing slip flow
                  await supabase.storage.from('documents').remove([idPath]);
                }
              }
            }
          }
        }

        // ===== A. Vendor bill intake — ส่งรูปได้ทันที ไม่ต้องลงทะเบียนก่อน =====
        const { data: pendingBilling } = await supabase
          .from('line_pending_billings')
          .select('id, kind, amount, description')
          .eq('line_user_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // คนนอก (ไม่ใช่แอดมิน) ส่งรูปเข้ามา = ส่งบิล เสมอ
        if (pendingBilling || userRole !== 'admin') {
          let ownerUserId: string | null = null;
          let submitterDisplayName: string | null = roleData?.display_name || null;
          let linkedVendorId: string | null = null;

          const { data: mapping } = await supabase
            .from('line_user_mappings')
            .select('supabase_user_id, display_name')
            .eq('line_user_id', userId)
            .maybeSingle();

          if (mapping?.supabase_user_id) {
            ownerUserId = mapping.supabase_user_id;
            submitterDisplayName = mapping.display_name || submitterDisplayName;
          }

          const { data: vendor } = await supabase
            .from('vendor_profiles')
            .select('id, user_id, company_name, contact_name')
            .eq('line_user_id', userId)
            .maybeSingle();
          if (vendor) {
            linkedVendorId = vendor.id;
            ownerUserId = ownerUserId || vendor.user_id;
            submitterDisplayName = vendor.company_name || vendor.contact_name || submitterDisplayName;
          }
          if (!ownerUserId) {
            const { data: staff } = await supabase
              .from('staff_profiles')
              .select('user_id, staff_name')
              .eq('line_user_id', userId)
              .maybeSingle();
            if (staff) {
              ownerUserId = staff.user_id;
              submitterDisplayName = staff.staff_name || submitterDisplayName;
            }
          }
          // ไม่รู้จักคนส่ง — ยังรับบิลเข้ากองรอตรวจของเจ้าของระบบ (ห้ามบังคับลงทะเบียน)
          if (!ownerUserId) ownerUserId = await getDefaultOwner(supabase);
          if (!ownerUserId) {
            await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId, '❌ ระบบยังไม่พร้อมรับบิล กรุณาติดต่อแอดมิน');
            continue;
          }

          // Download from LINE
          const contentResponse = await fetch(
            `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
          );
          if (!contentResponse.ok) throw new Error(`Failed to download content: ${contentResponse.status}`);
          const billingBytes = new Uint8Array(await contentResponse.arrayBuffer());
          const billingExt = isPDF ? 'pdf' : 'jpg';
          const billingContentType = isPDF ? 'application/pdf' : 'image/jpeg';
          const now = new Date();
          const billingPath = `vendor-bills/${ownerUserId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/line_${Date.now()}_${messageId}.${billingExt}`;

          const { error: billUploadErr } = await supabase.storage
            .from('receipts')
            .upload(billingPath, billingBytes, { contentType: billingContentType, upsert: false });

          if (billUploadErr) {
            console.error("Billing upload error:", billUploadErr);
            await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
              `❌ อัพโหลดไม่สำเร็จ: ${billUploadErr.message}`);
            continue;
          }

          // OCR ข้อเท็จจริงจากบิล (ยอด · เลขที่บิล · วันที่ · ชื่อร้าน · เลขผู้เสียภาษี)
          // ห้ามเดา project_tag / อีเวนท์ — เจ้าของใส่เองตอนอนุมัติ
          let billFacts: Record<string, unknown> | null = null;
          try {
            const LK = Deno.env.get("LOVABLE_API_KEY");
            if (LK) {
              const { data: signedBill } = await supabase.storage
                .from('receipts').createSignedUrl(billingPath, 300);
              if (signedBill?.signedUrl) billFacts = await ocrVendorBill(signedBill.signedUrl, LK, isPDF);
            }
          } catch (ocrErr) {
            console.error('Bill OCR error:', ocrErr);
          }

          const billAmount = Number(billFacts?.amount) || pendingBilling?.amount || 0;
          const billTaxId = typeof billFacts?.tax_id === 'string' ? billFacts.tax_id.replace(/\D/g, '') : '';
          const billVendorName = cleanText(billFacts?.vendor_name);
          const billDateRaw = typeof billFacts?.date_raw === 'string' ? billFacts.date_raw : null;
          const billDate = parseSlipDateRaw(billDateRaw) || now.toISOString().split('T')[0];

          // ยังไม่ผูกคู่ค้า — ลองจับด้วยเลขผู้เสียภาษีจากบิล (ตรงเป๊ะเท่านั้น)
          if (!linkedVendorId && billTaxId.length === 13) {
            const { data: byTax } = await supabase
              .from('vendor_profiles')
              .select('id, company_name')
              .eq('user_id', ownerUserId)
              .eq('tax_id', billTaxId)
              .maybeSingle();
            if (byTax) {
              linkedVendorId = byTax.id;
              await supabase.from('vendor_profiles').update({ line_user_id: userId } as any).eq('id', byTax.id);
              submitterDisplayName = byTax.company_name || submitterDisplayName;
            }
          }

          // ออกเลขรับบิลทันที (sequence — ไม่ซ้ำ ไม่ย้อนกลับ)
          let receiptNo: string | null = null;
          const { data: rn } = await supabase.rpc('next_vendor_receipt_no');
          if (typeof rn === 'string') receiptNo = rn;

          const { data: insertedBill, error: invErr } = await supabase.from('vendor_invoices').insert({
            user_id: ownerUserId,
            vendor_id: linkedVendorId,
            receipt_no: receiptNo,
            document_type: pendingBilling?.kind === 'receipt' ? 'receipt' : 'invoice',
            invoice_number: cleanText(billFacts?.invoice_number),
            amount: billAmount,
            vat_amount: Number(billFacts?.vat_amount) || 0,
            wht_amount: 0,
            wht_rate: 0,
            net_amount: billAmount,
            description: cleanText(billFacts?.description) || pendingBilling?.description || null,
            file_url: billingPath,
            invoice_date: billDate,
            status: 'pending',
            notes: `[LINE] จาก ${submitterDisplayName || billVendorName || userId}`,
            tax_id: billTaxId.length === 13 ? billTaxId : null,
            source: 'line',
            submitted_via_line_user_id: userId,
            submitted_via_line_display_name: submitterDisplayName || billVendorName,
            link_type: 'vendor',
            is_formal: !!billFacts?.is_formal,
          } as any).select('id').single();

          if (invErr) {
            console.error("Vendor invoice insert error:", invErr);
            await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
              `❌ บันทึกไม่สำเร็จ: ${invErr.message}`);
            continue;
          }

          if (pendingBilling) await supabase.from('line_pending_billings').delete().eq('id', pendingBilling.id);

          await notifyAdminEvent(ownerUserId, {
            event_type: 'vendor_bill_new',
            actor_kind: 'vendor',
            actor_name: submitterDisplayName || billVendorName || 'คู่ค้า',
            amount: billAmount,
            description: `${receiptNo || ''} ${cleanText(billFacts?.description) || ''}`.trim() || undefined,
          });

          const amtText = billAmount ? `฿${billAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'ยังอ่านยอดไม่ได้';
          const shopText = billVendorName ? ` · ร้าน ${billVendorName}` : '';
          await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
            `✅ รับบิลแล้ว เลขที่ ${receiptNo || '-'} · ${amtText}${shopText} · รอตรวจสอบครับ 🙏`);

          // ยังไม่รู้ว่าใครส่ง — ถามชื่อร้านครั้งเดียว แล้วผูกไลน์ไว้เลย
          if (!linkedVendorId) {
            await setConvState(supabase, userId, ownerUserId, 'awaiting_vendor_shop_name', {
              invoice_id: insertedBill?.id || null,
            });
            await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
              `ขอทราบชื่อร้าน / ชื่อบริษัทของคุณครั้งเดียวนะคะ (พิมพ์ตอบกลับได้เลย) ครั้งต่อไปส่งบิลได้ทันทีไม่ต้องตอบอีก`);
          }
          continue;
        }


        // No "received slip" acknowledgement — only the final OCR summary is pushed back.

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

        // 2. Download content from LINE
        const contentResponse = await fetch(
          `https://api-data.line.me/v2/bot/message/${messageId}/content`,
          { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
        );

        if (!contentResponse.ok) {
          throw new Error(`Failed to download content: ${contentResponse.status}`);
        }

        const contentBuffer = await contentResponse.arrayBuffer();
        const contentBytes = new Uint8Array(contentBuffer);

        // 3. Upload to temporary path first (will move after AI analysis)
        const timestamp = Date.now();
        const fileExt = isPDF ? 'pdf' : 'jpg';
        const contentType = isPDF ? 'application/pdf' : 'image/jpeg';
        const tempStoragePath = `line/${userId}/temp_${timestamp}_${messageId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(tempStoragePath, contentBytes, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // 4. Prepare content for AI analysis
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        let promptText = ANALYSIS_PROMPT;
        if (memo) {
          promptText += `\n\n## Memo/Caption ที่ส่งมาพร้อมสลิป:\n"${memo}"\n\nให้ใช้ข้อมูลจาก memo นี้เป็นหลักในการจัดหมวดหมู่และดึง staff_name, days_worked, event_name`;
        }

        // Build AI request
        let aiMessages;
        if (isPDF) {
          promptText += `\n\n(เอกสารนี้เป็นไฟล์ PDF จากธนาคาร กรุณาอ่านและวิเคราะห์เนื้อหาเช่นเดียวกับสลิปรูปภาพ)`;
          
          // Convert PDF to base64 using chunked approach (avoids stack overflow)
          const chunkSize = 8192;
          let binary = "";
          for (let i = 0; i < contentBytes.length; i += chunkSize) {
            const chunk = contentBytes.subarray(i, Math.min(i + chunkSize, contentBytes.length));
            for (let j = 0; j < chunk.length; j++) {
              binary += String.fromCharCode(chunk[j]);
            }
          }
          const base64Content = btoa(binary);
          const dataUri = `data:application/pdf;base64,${base64Content}`;
          
          aiMessages = [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: dataUri } }
              ]
            }
          ];
        } else {
          // For images, use signed URL from temp path
          const { data: signedData, error: signError } = await supabase.storage
            .from('receipts')
            .createSignedUrl(tempStoragePath, 300);
          if (signError || !signedData?.signedUrl) throw new Error("Failed to create signed URL");
          
          aiMessages = [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: signedData.signedUrl } }
              ]
            }
          ];
        }

        // Retry on 429/5xx with jittered backoff — handles bursts (e.g. 50 slips at once).
        let analyzeResponse: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          analyzeResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: aiMessages,
              tools: [TOOL_SCHEMA],
              tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
            }),
          });
          if (analyzeResponse.status !== 429 && analyzeResponse.status < 500) break;
          const base = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
          const jitter = Math.floor(Math.random() * 500);
          console.warn(`AI gateway ${analyzeResponse.status}, retry ${attempt + 1} in ${base + jitter}ms`);
          await new Promise((r) => setTimeout(r, base + jitter));
        }

        let extractedData: Record<string, unknown> | null = null;

        if (analyzeResponse?.ok) {
          const aiData = await analyzeResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            try {
              extractedData = JSON.parse(toolCall.function.arguments);
            } catch (parseErr) {
              console.error("Failed to parse tool call arguments:", parseErr);
            }
          }
          // Fallback: try to extract from message content
          if (!extractedData) {
            const content = aiData.choices?.[0]?.message?.content;
            if (content) {
              try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) extractedData = JSON.parse(jsonMatch[0]);
              } catch (_e) { console.error("Failed to parse content JSON"); }
            }
          }
        } else if (analyzeResponse) {
          const errText = await analyzeResponse.text();
          console.error("AI analysis failed:", analyzeResponse.status, errText);
        } else {
          console.error("AI analysis failed: no response from gateway");
        }

        // Fallback: if AI completely failed, use memo-based categorization
        if (!extractedData) {
          console.warn("AI extraction failed, using fallback categorization");
          extractedData = {
            amount: null,
            date: new Date().toISOString().split('T')[0],
            time: null,
            description: memo || `LINE Receipt ${messageId}`,
            merchant: null,
            sender: null,
            receiver: null,
            transaction_id: null,
            transaction_type: 'BUSINESS',
            category_group: 'GENERAL',
            project_tag: null,
            subcategory: null,
            confidence_score: 0,
            transaction_direction: 'EXPENSE',
            staff_name: null,
            days_worked: null,
            event_name: null,
          };
        }

        // 5. Move file to organized path: line/{userId}/{category}/{YYYY}/{MM}/
        const category = extractedData?.transaction_type || "PERSONAL";
        // Date: raw slip text is authoritative, parsed deterministically (ห้ามเดา)
        const rawDate: string | null = typeof extractedData?.date_raw === 'string' && extractedData.date_raw.trim()
          ? String(extractedData.date_raw).trim()
          : null;
        const parsedDate = parseSlipDateRaw(rawDate);
        if (parsedDate) {
          if (parsedDate !== extractedData.date) {
            console.warn(`Date normalized from raw "${rawDate}": ${extractedData.date} → ${parsedDate}`);
            (extractedData as any).needs_review = true;
          }
          extractedData.date = parsedDate;
        } else if (!extractedData?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(extractedData.date))) {
          extractedData.date = null;
          (extractedData as any).needs_review = true;
        } else {
          (extractedData as any).needs_review = true;
        }
        const expDate = extractedData?.date || new Date().toISOString().split('T')[0];
        const [year, month] = expDate.split('-');
        const organizedPath = `line/${userId}/${category}/${year}/${month}/${timestamp}_${messageId}.${fileExt}`;

        // Move: copy to new path, then delete temp
        const { data: tempFile } = await supabase.storage.from('receipts').download(tempStoragePath);
        if (tempFile) {
          const fileBytes = new Uint8Array(await tempFile.arrayBuffer());
          await supabase.storage.from('receipts').upload(organizedPath, fileBytes, {
            contentType,
            upsert: false,
          });
          await supabase.storage.from('receipts').remove([tempStoragePath]);
        }
        const storagePath = tempFile ? organizedPath : tempStoragePath;

        // 6. Clean time format (remove "น." suffix)
        let cleanTime: string | null = extractedData?.time || null;
        if (cleanTime) {
          cleanTime = cleanTime.replace(/\s*น\.?\s*/g, '').trim();
          // Validate HH:MM or HH:MM:SS format
          if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanTime)) {
            console.log("Invalid time format after cleaning, skipping:", cleanTime);
            cleanTime = null;
          }
        }

        // 7. รหัสงานจากช่องบันทึกช่วยจำ (@ / * / #) — จับคู่ตรงทั้งคำ ห้ามเดา
        let normalizedEventName = cleanText(extractedData?.event_name);
        let normalizedProjectTag: string | null = null;
        let eventCodeReason: string | null = null;

        const { data: registryEntries } = await supabase
          .from('event_registry')
          .select('event_name, project_tag, aliases')
          .eq('is_active', true);

        const memoCodes = extractEventCodes(
          memo,
          (extractedData as any)?.slip_memo,
          ...(((extractedData as any)?.event_codes || []) as string[]).map((c: string) => `@${c}`),
        );
        const codeResult = resolveEventCode(memoCodes, (registryEntries as any[]) || []);
        if (codeResult.tag) {
          normalizedProjectTag = codeResult.tag;
          const hit = (registryEntries as any[] | null)?.find((e) => e.project_tag === codeResult.tag);
          if (hit?.event_name) normalizedEventName = hit.event_name;
        } else {
          eventCodeReason = codeResult.reason;
        }
        console.log('Event code result:', JSON.stringify(codeResult));

        // Determine category label from transaction_type
        const typeLabel = category === 'BUSINESS' ? 'ธุรกิจ' : category === 'PERSONAL' ? 'ส่วนตัว' : category === 'TRANSFER' ? 'โอนเงิน' : category;

        // Save to expenses
        const expenseData: Record<string, unknown> = {
          amount: extractedData?.amount || 0,
          expense_date: expDate,
          ocr_date_raw: rawDate,
          expense_time: cleanTime,
          category: typeLabel,
          subcategory: cleanText(extractedData?.subcategory),
          description: cleanText(extractedData?.description) || `LINE Receipt ${messageId}`,
          merchant: cleanText(extractedData?.merchant),
          sender: cleanText(extractedData?.sender),
          receiver: cleanText(extractedData?.receiver),
          transaction_id: cleanText(extractedData?.transaction_id),
          transaction_type: cleanText(extractedData?.transaction_type),
          category_group: cleanText(extractedData?.category_group),
          project_tag: cleanText(normalizedProjectTag),
          transaction_direction: extractedData?.transaction_direction || 'EXPENSE',
          confidence_score: extractedData?.confidence_score || null,
          needs_review: (extractedData?.confidence_score || 0) < 75 || (extractedData as any)?.needs_review === true || !extractedData?.date || codeResult.needsReview || (extractedData?.category_group === 'EVENT' && !normalizedProjectTag),
          receipt_url: storagePath,
          staff_name: cleanText(extractedData?.staff_name),
          days_worked: extractedData?.days_worked || null,
          event_name: cleanText(normalizedEventName),
          memo_text: cleanText(memo),
        };

        // Resolve owner: mapping → vendor_profiles → staff_profiles → default super_admin
        let resolvedOwnerId: string | null = null;
        const { data: mapping, error: mappingError } = await supabase
          .from('line_user_mappings')
          .select('supabase_user_id')
          .eq('line_user_id', userId)
          .maybeSingle();
        if (mappingError) console.error("Mapping lookup error:", mappingError);
        if (mapping?.supabase_user_id) resolvedOwnerId = mapping.supabase_user_id;

        if (!resolvedOwnerId) {
          const { data: vendor } = await supabase
            .from('vendor_profiles').select('user_id').eq('line_user_id', userId).maybeSingle();
          if (vendor?.user_id) resolvedOwnerId = vendor.user_id;
        }
        if (!resolvedOwnerId) {
          const { data: staff } = await supabase
            .from('staff_profiles').select('user_id').eq('line_user_id', userId).maybeSingle();
          if (staff?.user_id) resolvedOwnerId = staff.user_id;
        }
        if (!resolvedOwnerId) {
          // Fallback: assign to default super_admin so slips are never orphaned
          const { data: superAdmin } = await supabase
            .from('user_roles').select('user_id').eq('role', 'super_admin').limit(1).maybeSingle();
          if (superAdmin?.user_id) {
            resolvedOwnerId = superAdmin.user_id;
            console.log(`Unregistered LINE user ${userId} — assigning slip to super_admin ${resolvedOwnerId}`);
          }
        }

        if (resolvedOwnerId) {
          expenseData.user_id = resolvedOwnerId;
        }
        // Reuse downstream as if mapping found
        const effectiveOwner = resolvedOwnerId;

        // Check for duplicate before inserting
        if (effectiveOwner) {
          const txnId = expenseData.transaction_id as string | null;
          const expAmount = expenseData.amount as number;

          let isDuplicate = false;

          // Priority 1: Check by transaction_id (most reliable)
          if (txnId) {
            const { data: existingTxn } = await supabase
              .from('expenses')
              .select('id')
              .eq('user_id', effectiveOwner)
              .eq('transaction_id', txnId)
              .maybeSingle();

            if (existingTxn) {
              isDuplicate = true;
              console.log("Duplicate transaction_id found:", txnId);
            }
          }

          // Priority 2: Check by amount + date + time (fallback when no txn_id)
          if (!isDuplicate && expAmount && expDate) {
            let dupQuery = supabase
              .from('expenses')
              .select('id, transaction_id')
              .eq('user_id', effectiveOwner)
              .eq('amount', expAmount)
              .eq('expense_date', expDate);

            const expTime = expenseData.expense_time as string | null;
            if (expTime) {
              dupQuery = dupQuery.eq('expense_time', expTime);
            }

            const { data: existingByAmount } = await dupQuery.maybeSingle();
            if (existingByAmount) {
              isDuplicate = true;
              console.log("Duplicate by amount+date found:", expAmount, expDate);
            }
          }

          if (isDuplicate) {
            const amt = extractedData?.amount ? `${extractedData.amount.toLocaleString()} บาท` : '';
            await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
              `⚠️ สลิปนี้ถูกบันทึกไปแล้ว (ไม่บันทึกซ้ำ)\n💰 ${amt}\n📅 ${expDate}`);
            continue;
          }
        }

        console.log("Inserting expense data:", JSON.stringify(expenseData));

        // entity มาจากทะเบียนงาน ไม่ใช่ AI เดา
        if (effectiveOwner) {
          expenseData.entity = await resolveEntity(
            supabase,
            effectiveOwner,
            (expenseData.project_tag as string | null) ?? null,
            (expenseData.transaction_type as string | null) ?? null,
          );
        }

        const { data: insertData, error: insertError } = await supabase
          .from('expenses')
          .insert(sanitizeExpense(expenseData))
          .select();

        if (insertError) {
          console.error("INSERT ERROR:", JSON.stringify(insertError));
          throw new Error(`Insert failed: ${insertError.message} (code: ${insertError.code}, details: ${insertError.details})`);
        }

        console.log("Insert success:", JSON.stringify(insertData));

        const insertedExpenseId = insertData?.[0]?.id || null;

        // 7a. ตัดจ่ายบิลคู่ค้าด้วยรหัสในช่องบันทึกช่วยจำ (@B0042 / @P0007) — ตรงเป๊ะเท่านั้น
        let autoMatchMsg = '';
        if (effectiveOwner) {
          autoMatchMsg = await settleByPaymentCode(
            supabase,
            effectiveOwner,
            [memo, extractedData?.memo_text as string | undefined, extractedData?.description as string | undefined],
            storagePath,
            insertedExpenseId,
            LINE_CHANNEL_ACCESS_TOKEN,
          );
        }

        // 7b. Auto-Match Payment (ทีมงาน): ยังใช้ยอด/ชื่อได้ตามเดิม
        if (!autoMatchMsg && effectiveOwner && extractedData?.amount) {
          autoMatchMsg = await autoMatchPayment(
            supabase,
            effectiveOwner,
            extractedData,
            storagePath,
            insertedExpenseId,
            LINE_CHANNEL_ACCESS_TOKEN,
            userId
          );
        }


        // 8. Reply to user with rich Flex Message
        const amount = extractedData?.amount ? `${extractedData.amount.toLocaleString()} บาท` : 'ไม่ทราบจำนวน';
        const cat = extractedData?.transaction_type || 'ไม่ระบุ';
        const group = extractedData?.category_group ? ` > ${extractedData.category_group}` : '';
        const sub = extractedData?.subcategory ? ` > ${extractedData.subcategory}` : '';
        const tag = normalizedProjectTag || '';
        const staff = extractedData?.staff_name || '';
        const days = extractedData?.days_worked ? ` (${extractedData.days_worked} วัน)` : '';
        const eventInfo = normalizedEventName || extractedData?.event_name || '';
        const confidence = extractedData?.confidence_score || 0;
        const reviewFlag = confidence < 75 || codeResult.needsReview;

        const editUrl = `https://slip-keeper-pro.lovable.app/?edit=${insertedExpenseId}`;

        // Build Flex Message body contents
        const detailRows: any[] = [
          ...(eventCodeReason ? [{ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "⚠️ รหัสงาน", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: eventCodeReason, wrap: true, size: "sm", flex: 5, color: "#e08b00" },
          ]}] : []),
          { type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "💰 จำนวนเงิน", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: amount, wrap: true, size: "sm", flex: 5, weight: "bold" },
          ]},
          { type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "📅 วันที่", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: expDate || '-', wrap: true, size: "sm", flex: 5 },
          ]},
          { type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "📂 หมวดหมู่", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: `${cat}${group}${sub}`, wrap: true, size: "sm", flex: 5 },
          ]},
        ];

        if (tag) {
          detailRows.push({ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "🏷️ แท็ก", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: tag, wrap: true, size: "sm", flex: 5 },
          ]});
        }
        if (staff) {
          detailRows.push({ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "👤 สตาฟ", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: `${staff}${days}`, wrap: true, size: "sm", flex: 5 },
          ]});
        }
        if (eventInfo) {
          detailRows.push({ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "🎪 อีเวนท์", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: eventInfo, wrap: true, size: "sm", flex: 5 },
          ]});
        }
        if (extractedData?.description) {
          detailRows.push({ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "📝 รายละเอียด", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: String(extractedData.description), wrap: true, size: "sm", flex: 5 },
          ]});
        }
        if (memo) {
          detailRows.push({ type: "box", layout: "baseline", spacing: "sm", contents: [
            { type: "text", text: "💬 Memo", color: "#aaaaaa", size: "sm", flex: 3 },
            { type: "text", text: memo, wrap: true, size: "sm", flex: 5 },
          ]});
        }

        const bodyContents: any[] = [
          { type: "text", text: "✅ บันทึกสำเร็จ!", weight: "bold", size: "lg", color: "#1DB446" },
          { type: "separator", margin: "md" },
          { type: "box", layout: "vertical", margin: "md", spacing: "sm", contents: detailRows },
        ];
        if (reviewFlag) {
          bodyContents.push({ type: "text", text: "⚠️ ต้องตรวจสอบ (confidence ต่ำ)", color: "#ff6b6b", size: "xs", margin: "md" });
        }
        if (autoMatchMsg) {
          bodyContents.push({ type: "text", text: autoMatchMsg.trim(), color: "#1DB446", size: "xs", margin: "md", wrap: true });
        }

        const flexMessage = {
          type: "flex",
          altText: `✅ บันทึกสำเร็จ! ${amount} - ${expDate}`,
          contents: {
            type: "bubble",
            body: { type: "box", layout: "vertical", contents: bodyContents },
            footer: {
              type: "box", layout: "vertical", spacing: "sm",
              contents: [
                {
                  type: "button", style: "primary", color: "#1DB446",
                  action: { type: "uri", label: "✏️ แก้ไขรายการ", uri: editUrl },
                },
              ],
            },
          },
        };

        await pushFlexToUser(LINE_CHANNEL_ACCESS_TOKEN, userId, flexMessage);

      } catch (err) {
        console.error("Error processing image:", err);
        await pushTextToUser(LINE_CHANNEL_ACCESS_TOKEN, userId,
          `❌ เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Unknown error'}\nกรุณาลองใหม่อีกครั้ง`
        );
      }
    }
    };

    // Kick off background processing; ACK LINE immediately.
    const bgPromise = processEvents()
      .then(() => sweepStaffDraftReminders(supabase, LINE_CHANNEL_ACCESS_TOKEN))
      .catch((e) => console.error("bg process error", e));
    try {
      // @ts-ignore - EdgeRuntime is provided by the Supabase Edge runtime
      if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(bgPromise);
      }
    } catch (_e) { /* ignore */ }

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

async function replyFlexToUser(token: string, replyToken: string, flexMessage: Record<string, unknown>) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [flexMessage],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Flex reply failed:", errText);
    }
  } catch (e) {
    console.error("Flex reply error:", e);
  }
}

async function pushTextToUser(token: string, to: string, message: string) {
  await pushMessage(token, to, [{ type: "text", text: message }]);
}

async function pushFlexToUser(token: string, to: string, flexMessage: Record<string, unknown>) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [flexMessage] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Flex push failed:", errText);
    }
  } catch (e) {
    console.error("Flex push error:", e);
  }
}

async function pushMessage(token: string, to: string, messages: Array<{type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string}>) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Push message failed:", errText);
    }
  } catch (e) {
    console.error("Push error:", e);
  }
}

async function autoMatchPayment(
  supabase: ReturnType<typeof createClient>,
  ownerUserId: string,
  extractedData: Record<string, unknown>,
  slipUrl: string,
  expenseId: string | null,
  lineToken: string,
  senderLineUserId?: string
): Promise<string> {
  const slipAmount = Number(extractedData.amount) || 0;
  if (slipAmount <= 0) return '';

  const tolerance = 2; // ±2 baht
  let matchMsg = '';

  // Helper: strip Thai honorific prefixes for better matching
  const stripPrefix = (name: string) => name.replace(/^(น้อง|พี่|ครู|อาจารย์|คุณ|นาย|นาง|น\.ส\.|นางสาว)\s*/i, '').trim();

  // Helper: clean bank account number (remove dashes, spaces)
  const cleanAccount = (acct: string | null | undefined) => (acct || '').replace(/[-\s]/g, '');

  try {
    void senderLineUserId; // reserved for future use
    // --- Staff Invoice matching ---
    const staffName = (extractedData.staff_name as string || '').trim().toLowerCase();
    const receiver = (extractedData.receiver as string || '').trim().toLowerCase();
    const eventName = (extractedData.event_name as string || '').trim().toLowerCase();
    const slipAccountRaw = (extractedData.transaction_id as string || '').replace(/[-\s]/g, '');

    console.log(`Auto-match: staffName="${staffName}", receiver="${receiver}", amount=${slipAmount}, slipAccount="${slipAccountRaw}"`);

    if (staffName || (extractedData.subcategory === 'Staff' && receiver) || slipAccountRaw) {
      const { data: pendingStaff } = await supabase
        .from('staff_invoices')
        .select('id, net_amount, gross_amount, wht_amount, wht_rate, event_name, event_id, staff_id, invoice_number, staff_profiles(staff_name, nickname, line_user_id, bank_account)')
        .eq('user_id', ownerUserId)
        .in('status', ['submitted', 'approved'])
        .is('payment_slip_url', null);

      console.log(`Auto-match: found ${pendingStaff?.length || 0} pending staff invoices`);

      if (pendingStaff && pendingStaff.length > 0) {
        const matches = pendingStaff.filter((inv: any) => {
          const invNet = Number(inv.net_amount);
          if (Math.abs(invNet - slipAmount) > tolerance) return false;

          // Bank account match (highest priority)
          const invBankAccount = cleanAccount(inv.staff_profiles?.bank_account);
          if (invBankAccount && slipAccountRaw && invBankAccount === slipAccountRaw) {
            console.log(`Auto-match: bank account matched for inv ${inv.id}`);
            return true;
          }

          const invStaffName = (inv.staff_profiles?.staff_name || '').toLowerCase();
          const invNickname = (inv.staff_profiles?.nickname || '').toLowerCase();
          const strippedStaffName = stripPrefix(staffName);
          const strippedInvName = stripPrefix(invStaffName);

          // Try matching with staffName first, then receiver
          const candidates = [staffName, strippedStaffName, receiver].filter(Boolean);

          const nameMatch = candidates.some(searchName => {
            const strippedSearch = stripPrefix(searchName);
            return (
              invStaffName.includes(searchName) || searchName.includes(invStaffName) ||
              invStaffName.includes(strippedSearch) || strippedSearch.includes(strippedInvName) ||
              (invNickname && (invNickname.includes(searchName) || searchName.includes(invNickname) ||
                invNickname.includes(strippedSearch) || strippedSearch.includes(invNickname)))
            );
          });

          // Also try matching receiver against bank account
          if (!nameMatch && invBankAccount && receiver) {
            const receiverClean = receiver.replace(/[-\s]/g, '');
            if (invBankAccount.includes(receiverClean) || receiverClean.includes(invBankAccount)) {
              console.log(`Auto-match: receiver matched bank account for inv ${inv.id}`);
              return true;
            }
          }

          if (!nameMatch) {
            console.log(`Auto-match: no name/account match for inv ${inv.id} (staff="${invStaffName}", nick="${invNickname}", bank="${invBankAccount}")`);
          }

          return nameMatch;
        });

        if (matches.length === 1) {
          const matched = matches[0];
          await supabase.from('staff_invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_slip_url: slipUrl,
            matched_expense_id: expenseId,
          } as any).eq('id', matched.id);

          const matchedName = (matched as any).staff_profiles?.staff_name || 'ทีมงาน';
          matchMsg = `\n\n✅ จับคู่การจ่ายเงินอัตโนมัติ: ${matchedName} — ${slipAmount.toLocaleString()} บาท`;
          console.log(`Auto-matched staff invoice ${matched.id} with expense ${expenseId}`);

          // Forward slip to staff via LINE
          const staffLineId = (matched as any).staff_profiles?.line_user_id;
          if (staffLineId && lineToken) {
            try {
              // Create signed URL for the slip image
              const { data: signedData } = await supabase.storage
                .from('receipts')
                .createSignedUrl(slipUrl, 86400); // 24 hours
              const slipImageUrl = signedData?.signedUrl || null;

              const thankYouMessages: Array<{type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string}> = [];
              if (slipImageUrl) {
                thankYouMessages.push({
                  type: "image",
                  originalContentUrl: slipImageUrl,
                  previewImageUrl: slipImageUrl,
                });
              }
              thankYouMessages.push({
                type: "text",
                text: `โอนเงินเรียบร้อย 💰 ${slipAmount.toLocaleString()} บาท\nขอบคุณที่มาช่วยกันจัดงานดีๆให้เด็กๆนะคะ 🙏❤️`,
              });
              await pushMessage(lineToken, staffLineId, thankYouMessages);
              console.log(`Sent payment confirmation to staff LINE: ${staffLineId}`);
            } catch (notifyErr) {
              console.error('Failed to notify staff via LINE:', notifyErr);
            }
          }
        } else if (matches.length > 1) {
          console.log(`Multiple staff invoice matches (${matches.length}), skipping auto-match`);
        }
        else if (matches.length === 0) {
          // Fallback: if exactly ONE pending invoice has matching amount (within tolerance), auto-match
          // This handles cases where slip name is in English but staff is in Thai
          const amountOnly = pendingStaff.filter((inv: any) => Math.abs(Number(inv.net_amount) - slipAmount) <= tolerance);
          if (amountOnly.length === 1) {
            const matched = amountOnly[0];
            await supabase.from('staff_invoices').update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              payment_slip_url: slipUrl,
              matched_expense_id: expenseId,
            } as any).eq('id', matched.id);
            const matchedName = (matched as any).staff_profiles?.staff_name || 'ทีมงาน';
            matchMsg = `\n\n✅ จับคู่อัตโนมัติ (จำนวนเงินตรง): ${matchedName} — ${slipAmount.toLocaleString()} บาท`;
            console.log(`Auto-matched (amount-only) staff invoice ${matched.id}`);
          }
        }
      }
    }

    // --- บิลคู่ค้า: ไม่จับคู่ด้วยยอดเงินหรือชื่อ ---
    // ตัดจ่ายด้วยรหัส @B0042 / @P0007 ในช่องบันทึกช่วยจำเท่านั้น (settleByPaymentCode)
  } catch (err) {
    console.error('Auto-match error:', err);
  }

  return matchMsg;
}

// ============================================================
// ตัดจ่ายบิลคู่ค้า/ใบสรุปการจ่าย ด้วยรหัสในช่องบันทึกช่วยจำ
//   @B0042 = บิลใบเดียว · @P0007 = ทุกบิลในใบสรุปการจ่าย
//   ตรงทั้งคำเท่านั้น · ไม่ตรง/เจอหลายรหัส → ไม่ตัด ให้คนเลือก
// ============================================================
async function settleByPaymentCode(
  supabase: ReturnType<typeof createClient>,
  ownerUserId: string,
  texts: Array<string | null | undefined>,
  slipUrl: string,
  expenseId: string | null,
  lineToken: string,
): Promise<string> {
  const parsed = resolvePaymentCode(...texts);
  if (parsed.status === 'none') return '';
  if (parsed.status === 'ambiguous') return `\n\n⚠️ ${parsed.reason}`;

  try {
    let voucherId: string | null = null;
    let label = '';
    let bills: any[] = [];

    if (parsed.status === 'voucher') {
      const { data: voucher } = await supabase
        .from('payment_vouchers')
        .select('id, voucher_number')
        .eq('user_id', ownerUserId)
        .eq('voucher_number', parsed.voucherNo)
        .maybeSingle();
      if (!voucher) return `\n\n⚠️ ไม่พบใบสรุปการจ่าย @${parsed.voucherNo} ในระบบ (ไม่ตัดจ่าย)`;
      voucherId = (voucher as any).id;
      label = `@${parsed.voucherNo}`;
      const { data } = await supabase
        .from('vendor_invoices')
        .select('id, receipt_no, amount, wht_amount, net_amount, vendor_id, submitted_via_line_user_id, vendor_profiles(company_name, line_user_id)')
        .eq('user_id', ownerUserId)
        .eq('voucher_id', voucherId);
      bills = data || [];
    } else {
      const { data } = await supabase
        .from('vendor_invoices')
        .select('id, receipt_no, amount, wht_amount, net_amount, vendor_id, submitted_via_line_user_id, vendor_profiles(company_name, line_user_id)')
        .eq('user_id', ownerUserId)
        .eq('receipt_no', parsed.billNo);
      bills = data || [];
      if (!bills.length) return `\n\n⚠️ ไม่พบบิลเลขที่ @${parsed.billNo} ในระบบ (ไม่ตัดจ่าย)`;
      label = `@${parsed.billNo}`;
    }

    if (!bills.length) return `\n\n⚠️ ${label} ยังไม่มีบิลผูกอยู่ (ไม่ตัดจ่าย)`;

    const nowIso = new Date().toISOString();
    await supabase.from('vendor_invoices').update({
      status: 'paid',
      paid_at: nowIso,
      payment_slip_url: slipUrl,
      matched_expense_id: expenseId,
    } as any).in('id', bills.map((b: any) => b.id));

    const totalNet = bills.reduce((s: number, b: any) => s + (Number(b.net_amount) || 0), 0);
    const totalWht = bills.reduce((s: number, b: any) => s + (Number(b.wht_amount) || 0), 0);

    if (voucherId) {
      await supabase.from('payment_vouchers').update({
        status: 'paid',
        paid_date: nowIso.split('T')[0],
        payment_slip_url: slipUrl,
        matched_expense_id: expenseId,
      } as any).eq('id', voucherId);
    }

    // ส่งสลิปกลับให้คู่ค้าทางไลน์
    const targets = new Set<string>();
    for (const b of bills) {
      const lid = (b as any).vendor_profiles?.line_user_id || (b as any).submitted_via_line_user_id;
      if (lid) targets.add(lid);
    }
    if (targets.size && lineToken) {
      let slipImageUrl: string | null = null;
      try {
        const { data: signed } = await supabase.storage.from('receipts').createSignedUrl(slipUrl, 86400);
        slipImageUrl = signed?.signedUrl || null;
      } catch (_e) { /* ignore */ }
      const whtLine = totalWht > 0
        ? `\nหัก ณ ที่จ่าย ${totalWht.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท (หนังสือรับรองจะส่งตามให้ค่ะ)`
        : '';
      for (const lid of targets) {
        const messages: Array<Record<string, unknown>> = [];
        if (slipImageUrl && !slipUrl.toLowerCase().endsWith('.pdf')) {
          messages.push({ type: 'image', originalContentUrl: slipImageUrl, previewImageUrl: slipImageUrl });
        }
        messages.push({
          type: 'text',
          text: `โอนเงินเรียบร้อยค่ะ 💰 ${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท\nอ้างอิง ${label}${whtLine}\nขอบคุณมากค่ะ 🙏`,
        });
        try { await pushMessage(lineToken, lid, messages as any); } catch (_e) { /* ignore */ }
      }
    }

    return `\n\n✅ ตัดจ่ายด้วยรหัส ${label} · ${bills.length} ใบ · สุทธิ ${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท`;
  } catch (err) {
    console.error('settleByPaymentCode error:', err);
    return '';
  }
}

// ============================================================
// OCR บิลคู่ค้า — อ่านเฉพาะข้อเท็จจริงบนเอกสาร ห้ามเดา project/event
// ============================================================
async function ocrVendorBill(fileUrl: string, apiKey: string, isPDF = false): Promise<Record<string, unknown> | null> {
  if (isPDF) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: [
            "อ่านเอกสารวางบิล/ใบเสร็จ/ใบกำกับภาษีของไทย และคืนเฉพาะข้อเท็จจริงที่เห็นบนเอกสาร",
            "ห้ามเดาโครงการ อีเวนท์ หมวดหมู่ หรือข้อมูลที่ไม่ปรากฏ — ไม่เห็นให้เป็น null",
            "วันที่: สลิป/บิลไทยเรียงวัน-เดือน-ปี ให้คืนข้อความดิบใน date_raw ตามที่พิมพ์บนเอกสาร ห้ามจัดรูปแบบใหม่",
            "amount = ยอดรวมสุทธิที่ต้องชำระตามเอกสาร (ก่อนหัก ณ ที่จ่าย)",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "อ่านบิลนี้" },
            { type: "image_url", image_url: { url: fileUrl } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "save_bill",
          description: "บันทึกข้อเท็จจริงจากบิล",
          parameters: {
            type: "object",
            properties: {
              amount: { type: ["number", "null"] },
              vat_amount: { type: ["number", "null"] },
              invoice_number: { type: ["string", "null"] },
              date_raw: { type: ["string", "null"] },
              vendor_name: { type: ["string", "null"] },
              tax_id: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              is_formal: { type: ["boolean", "null"], description: "เป็นใบกำกับภาษี/ใบเสร็จที่ถูกต้องตามกฎหมายหรือไม่" },
            },
            required: ["amount"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "save_bill" } },
    }),
  });
  if (!res.ok) {
    console.error('ocrVendorBill failed:', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try { return JSON.parse(args); } catch { return null; }
}


// ============================================================
// Helpers: profile resolution, conversation state, welcome flex,
// ID card OCR, conversational expense entry
// ============================================================

interface LineProfile {
  kind: 'admin' | 'staff' | 'vendor';
  owner: string;
  displayName: string | null;
  profileId: string | null;
  profile?: any;
}

async function resolveLineUserProfile(supabase: any, lineUserId: string): Promise<LineProfile | null> {
  const { data: mapping } = await supabase.from('line_user_mappings')
    .select('supabase_user_id, display_name').eq('line_user_id', lineUserId).maybeSingle();
  if (mapping?.supabase_user_id) {
    return { kind: 'admin', owner: mapping.supabase_user_id, displayName: mapping.display_name, profileId: null };
  }
  const { data: staff } = await supabase.from('staff_profiles')
    .select('id, user_id, staff_name, nickname, id_card_url').eq('line_user_id', lineUserId).maybeSingle();
  if (staff) {
    return { kind: 'staff', owner: staff.user_id, displayName: staff.staff_name || staff.nickname, profileId: staff.id, profile: staff };
  }
  const { data: vendor } = await supabase.from('vendor_profiles')
    .select('id, user_id, company_name, contact_name, id_card_url').eq('line_user_id', lineUserId).maybeSingle();
  if (vendor) {
    return { kind: 'vendor', owner: vendor.user_id, displayName: vendor.company_name || vendor.contact_name, profileId: vendor.id, profile: vendor };
  }
  return null;
}

async function getConvState(supabase: any, lineUserId: string) {
  const { data } = await supabase.from('line_conversation_state').select('*')
    .eq('line_user_id', lineUserId).gt('expires_at', new Date().toISOString()).maybeSingle();
  return data;
}

async function setConvState(supabase: any, lineUserId: string, owner: string, state: string, draft: Record<string, any>, ttlMinutes = 10) {
  await supabase.from('line_conversation_state').upsert({
    line_user_id: lineUserId, owner, state, draft_data: draft,
    expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'line_user_id' });
}

async function clearConvState(supabase: any, lineUserId: string) {
  await supabase.from('line_conversation_state').delete().eq('line_user_id', lineUserId);
}

async function getDefaultOwner(supabase: any): Promise<string | null> {
  const { data: sa } = await supabase.from('user_roles')
    .select('user_id').eq('role', 'super_admin').limit(1).maybeSingle();
  if (sa?.user_id) return sa.user_id;
  const { data: admin } = await supabase.from('user_roles')
    .select('user_id').eq('role', 'admin').limit(1).maybeSingle();
  return admin?.user_id || null;
}

async function handleRegistrationConvReply(
  supabase: any, token: string, replyToken: string, lineUserId: string,
  state: any, text: string,
): Promise<boolean> {
  const owner = state.owner;
  const draft = (state.draft_data || {}) as Record<string, any>;

  // STEP 1: phone collection → try matching staff + vendor
  if (state.state === 'awaiting_register_phone') {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 10) {
      await replyToUser(token, replyToken, '❌ เบอร์โทรไม่ถูกต้อง กรุณาพิมพ์ใหม่ (เช่น 0812345678)');
      return true;
    }

    // Try staff first
    const { data: staffRes } = await supabase.rpc('link_staff_line_id', {
      p_owner: owner, p_phone: digits, p_line_user_id: lineUserId,
    });
    if (staffRes?.status === 'linked' || staffRes?.status === 'already_linked') {
      await clearConvState(supabase, lineUserId);
      const name = staffRes.profile?.staff_name || staffRes.profile?.nickname || 'ทีมงาน';
      if (staffRes.status === 'linked') {
        await notifyAdminEvent(owner, { event_type: 'link_success', actor_kind: 'staff', actor_name: name });
      }
      await replyToUser(token, replyToken,
        `✅ ผูกบัญชีสำเร็จ!\n👤 ${name} (ทีมงาน)\n\nคุณสามารถพิมพ์แจ้งค่าใช้จ่าย หรือส่งสำเนาบัตรประชาชน/ใบเสร็จได้เลยครับ`);
      return true;
    }
    if (staffRes?.status === 'multiple') {
      const items = (staffRes.candidates || []).slice(0, 4).map((c: any) => ({
        label: c.staff_name || c.nickname || 'staff',
        data: `เลือกทีมงาน:${c.id}`,
      }));
      draft.phone = digits;
      await setConvState(supabase, lineUserId, owner, 'awaiting_register_pick_staff', draft);
      await replyWithQuickReply(token, replyToken, 'พบหลายบัญชีที่ใช้เบอร์นี้ — กรุณาเลือก:', items);
      return true;
    }

    // Try vendor (by phone)
    const { data: vendorRes } = await supabase.rpc('link_vendor_line_id', {
      p_owner: owner, p_phone: digits, p_tax_id: '', p_line_user_id: lineUserId,
    });
    if (vendorRes?.status === 'linked' || vendorRes?.status === 'already_linked') {
      await clearConvState(supabase, lineUserId);
      const name = vendorRes.profile?.company_name || 'คู่ค้า';
      if (vendorRes.status === 'linked') {
        await notifyAdminEvent(owner, { event_type: 'link_success', actor_kind: 'vendor', actor_name: name });
      }
      await replyToUser(token, replyToken,
        `✅ ผูกบัญชีสำเร็จ!\n🏢 ${name} (คู่ค้า)\n\nคุณสามารถส่งใบวางบิล/ใบเสร็จเข้ามาในแชตได้เลยครับ`);
      return true;
    }
    if (vendorRes?.status === 'multiple') {
      const items = (vendorRes.candidates || []).slice(0, 4).map((c: any) => ({
        label: c.company_name || 'vendor', data: `เลือกคู่ค้า:${c.id}`,
      }));
      draft.phone = digits;
      await setConvState(supabase, lineUserId, owner, 'awaiting_register_pick_vendor', draft);
      await replyWithQuickReply(token, replyToken, 'พบหลายบัญชีคู่ค้า — กรุณาเลือก:', items);
      return true;
    }

    // Not found → start new registration
    draft.phone = digits;
    await setConvState(supabase, lineUserId, owner, 'awaiting_register_role', draft);
    await replyWithQuickReply(token, replyToken,
      `ไม่พบบัญชีของเบอร์ ${digits} ในระบบ\n\nคุณเป็น...`,
      [{ label: '👤 ทีมงาน', data: 'บทบาท:staff' }, { label: '🏢 คู่ค้า/ผู้ขาย', data: 'บทบาท:vendor' }]);
    return true;
  }

  // STEP 1b: pick from multiple candidates
  if (state.state === 'awaiting_register_pick_staff') {
    const m = text.match(/^เลือกทีมงาน:([0-9a-f-]{36})$/i);
    if (!m) {
      await replyToUser(token, replyToken, '❌ กรุณากดเลือกจากปุ่ม');
      return true;
    }
    const res = await supabase.rpc('link_staff_line_id', {
      p_owner: owner, p_phone: draft.phone, p_line_user_id: lineUserId, p_staff_id: m[1],
    });
    await clearConvState(supabase, lineUserId);
    const name = res?.data?.profile?.staff_name || 'ทีมงาน';
    if (res?.data?.status === 'linked') {
      await notifyAdminEvent(owner, { event_type: 'link_success', actor_kind: 'staff', actor_name: name });
    }
    await replyToUser(token, replyToken, `✅ ผูกบัญชีสำเร็จ! 👤 ${name}`);
    return true;
  }
  if (state.state === 'awaiting_register_pick_vendor') {
    const m = text.match(/^เลือกคู่ค้า:([0-9a-f-]{36})$/i);
    if (!m) {
      await replyToUser(token, replyToken, '❌ กรุณากดเลือกจากปุ่ม');
      return true;
    }
    const res = await supabase.rpc('link_vendor_line_id', {
      p_owner: owner, p_phone: draft.phone, p_tax_id: '', p_line_user_id: lineUserId, p_vendor_id: m[1],
    });
    await clearConvState(supabase, lineUserId);
    const name = res?.data?.profile?.company_name || 'คู่ค้า';
    if (res?.data?.status === 'linked') {
      await notifyAdminEvent(owner, { event_type: 'link_success', actor_kind: 'vendor', actor_name: name });
    }
    await replyToUser(token, replyToken, `✅ ผูกบัญชีสำเร็จ! 🏢 ${name}`);
    return true;
  }

  // STEP 2: choose role
  if (state.state === 'awaiting_register_role') {
    const m = text.match(/^บทบาท:(staff|vendor)$/);
    if (!m) {
      await replyWithQuickReply(token, replyToken, 'กรุณาเลือกบทบาท:',
        [{ label: '👤 ทีมงาน', data: 'บทบาท:staff' }, { label: '🏢 คู่ค้า/ผู้ขาย', data: 'บทบาท:vendor' }]);
      return true;
    }
    draft.role = m[1];
    await setConvState(supabase, lineUserId, owner, 'awaiting_register_name', draft);
    const prompt = m[1] === 'staff'
      ? '✏️ กรุณาพิมพ์ ชื่อ-นามสกุล ของคุณ\n(เช่น "สมชาย ใจดี")'
      : '✏️ กรุณาพิมพ์ ชื่อบริษัท/ร้าน ของคุณ\n(เช่น "ร้านอาหารสมศรี")';
    await replyToUser(token, replyToken, prompt);
    return true;
  }

  // STEP 3: collect name → create profile
  if (state.state === 'awaiting_register_name') {
    const name = text.trim().slice(0, 200);
    if (name.length < 2) {
      await replyToUser(token, replyToken, '❌ ชื่อสั้นเกินไป กรุณาพิมพ์ใหม่');
      return true;
    }
    if (draft.role === 'staff') {
      const { data, error } = await supabase.from('staff_profiles').insert({
        user_id: owner, staff_name: name, phone: draft.phone,
        line_user_id: lineUserId, is_active: true,
      }).select('id, staff_name').maybeSingle();
      if (error) {
        console.error('register staff error:', error);
        await replyToUser(token, replyToken, '❌ บันทึกไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อแอดมิน');
        return true;
      }
      await clearConvState(supabase, lineUserId);
      await notifyAdminEvent(owner, { event_type: 'new_registration', actor_kind: 'staff', actor_name: data?.staff_name || name });
      await replyToUser(token, replyToken,
        `✅ ลงทะเบียนสำเร็จ!\n👤 ${data?.staff_name} (ทีมงาน)\n📱 ${draft.phone}\n\n📸 ขั้นต่อไป: ส่งสำเนาบัตรประชาชนเข้ามาในแชต ระบบจะอ่านและจัดเก็บให้อัตโนมัติ`);
      return true;
    } else {
      const { data, error } = await supabase.from('vendor_profiles').insert({
        user_id: owner, company_name: name, phone: draft.phone,
        line_user_id: lineUserId,
      }).select('id, company_name').maybeSingle();
      if (error) {
        console.error('register vendor error:', error);
        await replyToUser(token, replyToken, '❌ บันทึกไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อแอดมิน');
        return true;
      }
      await clearConvState(supabase, lineUserId);
      await notifyAdminEvent(owner, { event_type: 'new_registration', actor_kind: 'vendor', actor_name: data?.company_name || name });
      await replyToUser(token, replyToken,
        `✅ ลงทะเบียนสำเร็จ!\n🏢 ${data?.company_name} (คู่ค้า)\n📱 ${draft.phone}\n\n📸 ขั้นต่อไป: ส่งสำเนาบัตรประชาชน + ใบวางบิล/ใบเสร็จเข้ามาในแชตได้เลยครับ`);
      return true;
    }
  }

  return false;
}

function getLinkAccountFlex(rawText: string): Record<string, unknown> {
  const LIFF_BASE = "https://liff.line.me/2008893199-xaJITz5y";
  return {
    type: "flex",
    altText: "กรุณาผูกบัญชีก่อนแจ้งรายการ",
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "lg", contents: [
        { type: "text", text: "🔗 ผูกบัญชีก่อนนะคะ", weight: "bold", size: "md" },
        { type: "text", text: "ยังไม่พบบัญชีของคุณในระบบค่ะ กดปุ่มด้านล่างเพื่อผูกบัญชี (ใช้เบอร์โทร/เลขผู้เสียภาษี) แล้วส่งรายการเข้ามาอีกครั้งได้เลยค่ะ", size: "sm", wrap: true, color: "#555555" },
        { type: "text", text: `📝 ${rawText.slice(0, 120)}`, size: "xs", wrap: true, color: "#999999" },
      ]},
      footer: { type: "box", layout: "vertical", paddingAll: "lg", contents: [
        { type: "button", style: "primary", color: "#1E40AF", height: "sm",
          action: { type: "uri", label: "🔗 ผูกบัญชี", uri: `${LIFF_BASE}?view=quick-link` } },
      ]},
    },
  };
}

function getWelcomeFlex(displayName: string | null): Record<string, unknown> {
  const LIFF_BASE = "https://liff.line.me/2008893199-xaJITz5y";
  const greet = displayName ? `สวัสดี ${displayName} ค่ะ! 🎉` : 'สวัสดีค่ะ! 🎉';
  return {
    type: "flex",
    altText: `${greet} ยินดีต้อนรับสู่ Cruzee Finance`,
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", paddingAll: "lg", backgroundColor: "#1E40AF", contents: [
        { type: "text", text: greet, weight: "bold", size: "lg", color: "#FFFFFF", wrap: true },
        { type: "text", text: "Cruzee Finance LINE Bot", size: "sm", color: "#BFDBFE", margin: "xs" },
      ]},
      body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "lg", contents: [
        { type: "text", text: "เริ่มต้นใช้งานง่ายๆ:", weight: "bold", size: "sm" },
        { type: "text", text: "1️⃣ กดปุ่ม \"ผูกบัญชี\" — ระบบจะค้นหาบัญชีของคุณอัตโนมัติ", size: "sm", wrap: true, color: "#333333" },
        { type: "text", text: "2️⃣ ส่งสำเนาบัตรประชาชนเข้าแชต — ระบบจะอ่านและจัดเก็บอัตโนมัติ", size: "sm", wrap: true, color: "#333333" },
        { type: "text", text: "3️⃣ พิมพ์แจ้งค่าใช้จ่ายได้ทันที เช่น \"ค่าแท็กซี่ 250 บาท\"", size: "sm", wrap: true, color: "#333333" },
      ]},
      footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg", contents: [
        { type: "button", style: "primary", color: "#1E40AF", height: "sm",
          action: { type: "uri", label: "🔗 ผูกบัญชี / ลงทะเบียน", uri: `${LIFF_BASE}?view=quick-link` } },
        { type: "button", style: "primary", color: "#059669", height: "sm",
          action: { type: "message", label: "📱 ลงทะเบียนด้วยเบอร์โทร", text: "ลงทะเบียน" } },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "message", label: "📖 ดูคู่มือ", text: "help" } },
      ]},
    },
  };
}

async function replyWithQuickReply(token: string, replyToken: string, text: string, items: Array<{label: string; data: string}>) {
  const quickItems = items.slice(0, 13).map(it => ({
    type: "action",
    action: { type: "message", label: it.label.slice(0, 20), text: it.data },
  }));
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text, quickReply: { items: quickItems } }],
      }),
    });
  } catch (e) { console.error("QR reply error:", e); }
}

async function ocrIdCard(imageUrl: string, apiKey: string) {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: [
          { type: "text", text: "นี่คือบัตรประชาชนไทยหรือไม่? ถ้าใช่ดึง: เลขประจำตัวประชาชน 13 หลัก (id_number ไม่ใส่ขีด), ชื่อ-สกุลภาษาไทย (full_name), วันหมดอายุ (expiry, YYYY-MM-DD). ถ้าไม่ใช่ให้ใส่ null ทั้งหมด" },
          { type: "image_url", image_url: { url: imageUrl } },
        ]}],
        tools: [{ type: "function", function: {
          name: "extract_id_card", description: "Extract Thai national ID card",
          parameters: {
            type: "object",
            properties: {
              id_number: { type: ["string", "null"] },
              full_name: { type: ["string", "null"] },
              expiry: { type: ["string", "null"] },
            },
            required: ["id_number", "full_name", "expiry"],
            additionalProperties: false,
          },
        }}],
        tool_choice: { type: "function", function: { name: "extract_id_card" } },
      }),
    });
    if (!res.ok) { console.error("OCR ID failed:", res.status); return null; }
    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return null;
    return JSON.parse(tc.function.arguments) as { id_number: string | null; full_name: string | null; expiry: string | null };
  } catch (e) { console.error("OCR ID error:", e); return null; }
}

function formatThaiId(id: string): string {
  if (!/^\d{13}$/.test(id)) return id;
  return `${id[0]}-${id.slice(1,5)}-${id.slice(5,10)}-${id.slice(10,12)}-${id[12]}`;
}

const STAFF_EXPENSE_PROMPT = `วิเคราะห์ข้อความแจ้งค่าใช้จ่ายจากทีมงาน/คู่ค้า แล้วสกัด:
- amount: จำนวนเงิน (บาท) ถ้าไม่พบใส่ null
- description: รายละเอียดสั้น (จ่ายอะไร/ซื้ออะไร)
- subcategory_hint: ประเภทค่าใช้จ่าย (Transport/Food/Printing/Venue/Equipment/Prizes/Marketing/Other)
- event_hint: ชื่ออีเวนท์/สถานที่ที่กล่าวถึง หรือ null
- has_receipt: true ถ้าระบุว่ามีบิล/ใบเสร็จ`;

const STAFF_EXPENSE_TOOL = {
  type: "function", function: {
    name: "extract_staff_expense",
    description: "Extract staff/vendor expense data from Thai text",
    parameters: {
      type: "object",
      properties: {
        amount: { type: ["number", "null"] },
        description: { type: ["string", "null"] },
        subcategory_hint: { type: ["string", "null"] },
        event_hint: { type: ["string", "null"] },
        has_receipt: { type: "boolean" },
      },
      required: ["amount", "description", "subcategory_hint", "event_hint", "has_receipt"],
      additionalProperties: false,
    },
  },
};

async function parseStaffExpenseAI(text: string, apiKey: string) {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: STAFF_EXPENSE_PROMPT }, { role: "user", content: text }],
        tools: [STAFF_EXPENSE_TOOL],
        tool_choice: { type: "function", function: { name: "extract_staff_expense" } },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return null;
    return JSON.parse(tc.function.arguments);
  } catch (e) { console.error("Staff expense parse error:", e); return null; }
}

function looksLikeExpenseText(text: string): boolean {
  const hasNum = /\d{2,}/.test(text);
  const hasHint = /ค่า|จ่าย|ซื้อ|บิล|บาท|baht|tip|ทิป|เบิก/i.test(text);
  return hasNum && hasHint && text.length < 250;
}

async function buildEventQuickReply(supabase: any, owner: string) {
  // Events come from event_registry (synced one-way from ReadyGo). Buttons only — no free typing.
  const { data } = await supabase.from('event_registry')
    .select('event_name, project_tag, event_date')
    .eq('user_id', owner).eq('is_active', true)
    .not('project_tag', 'is', null)
    .order('event_date', { ascending: false, nullsFirst: false })
    .limit(200);

  const today = Date.now();
  const before = 60 * 24 * 3600 * 1000;
  const after = 90 * 24 * 3600 * 1000;
  const TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  const near = (data || [])
    .map((e: any) => {
      const t = e.event_date ? new Date(e.event_date).getTime() : NaN;
      return { ...e, diff: Number.isNaN(t) ? Number.POSITIVE_INFINITY : t - today, abs: Number.isNaN(t) ? Number.POSITIVE_INFINITY : Math.abs(t - today) };
    })
    .filter((e: any) => e.diff <= after && e.diff >= -before)
    .sort((a: any, b: any) => a.abs - b.abs)
    .slice(0, 10);

  const items: Array<{label: string; data: string}> = near.map((e: any) => {
    const d = e.event_date ? new Date(e.event_date) : null;
    const dateLabel = d ? ` ${d.getDate()} ${TH[d.getMonth()]}` : '';
    const label = `🎪 ${e.event_name}${dateLabel}`;
    return { label: label.slice(0, 20), data: `[EVENT]${e.project_tag}|${e.event_name}` };
  });

  items.push({ label: 'ส่วนตัว', data: '[EVENT]PERSONAL|ส่วนตัว' });
  items.push({ label: 'ออฟฟิศทั่วไป', data: '[EVENT]OFFICE|ออฟฟิศทั่วไป' });
  items.push({ label: 'ยังไม่รู้', data: '[EVENT]UNKNOWN|ยังไม่รู้' });
  return items;
}

// หมวดค่าใช้จ่ายชุดเดียวกับ ReadyGo — ปุ่มเท่านั้น ไม่รับพิมพ์เอง
const LINE_SUBCATEGORY_CHOICES: Array<{label: string; value: string}> = [
  { label: 'ทีมงาน/ค่าแรง', value: 'staff' },
  { label: 'ฟรีแลนซ์', value: 'freelance' },
  { label: 'ค่าพิธีกร MC', value: 'mc_fee' },
  { label: 'เดินทาง/ขนส่ง', value: 'transport' },
  { label: 'อาหาร/น้ำ', value: 'food' },
  { label: 'งานพิมพ์', value: 'printing' },
  { label: 'เช่าสถานที่', value: 'venue_rental' },
  { label: 'อุปกรณ์', value: 'equipment' },
  { label: 'ถ้วยรางวัล', value: 'trophy' },
  { label: 'เหรียญรางวัล', value: 'medal' },
  { label: 'Race Kit', value: 'race_kit' },
  { label: 'ของแจก', value: 'giveaway' },
  { label: 'โฆษณา', value: 'advertising' },
];

function getCategoryQuickReply(): Array<{label: string; data: string}> {
  return LINE_SUBCATEGORY_CHOICES.slice(0, 13).map((c) => ({
    label: c.label.slice(0, 20),
    data: `[CAT]${c.value}`,
  }));
}

function normalizeLineSubcategory(value: string): string | null {
  const v = (value || '').trim();
  const hit = LINE_SUBCATEGORY_CHOICES.find((c) => c.value === v || c.label === v);
  return hit ? hit.value : null;
}

async function startExpenseConversation(
  supabase: any, lineToken: string, replyToken: string,
  lineUserId: string, profile: LineProfile, parsed: any, rawText: string
) {
  const draft: Record<string, any> = {
    amount: parsed.amount,
    description: parsed.description || rawText,
    subcategory: normalizeLineSubcategory(cleanText(parsed.subcategory_hint) || ''),
    event_name: cleanText(parsed.event_hint),
    project_tag: null,
    raw_text: rawText,
  };
  const events = await buildEventQuickReply(supabase, profile.owner);
  await setConvState(supabase, lineUserId, profile.owner, 'awaiting_event', draft);
  await replyWithQuickReply(lineToken, replyToken,
    `📝 ${draft.description}\n💰 ${Number(draft.amount).toLocaleString()} บาท\n\n🎪 ค่าใช้จ่ายของอีเวนท์ไหน? (พิมพ์ "ยกเลิก" เพื่อเลิก)`,
    events);
}

async function handleExpenseConvReply(
  supabase: any, lineToken: string, replyToken: string,
  lineUserId: string, state: any, text: string
): Promise<boolean> {
  const draft = state.draft_data || {};

  if (state.state === 'awaiting_event') {
    if (text.startsWith('[EVENT]')) {
      const val = text.slice(7);
      const [tag, name] = val.split('|');
      draft.project_tag = tag;
      draft.event_name = tag === 'UNKNOWN' ? null : (name || tag);
      if (tag === 'UNKNOWN') draft.needs_review = true;
    } else {
      // Select-only: re-ask with buttons instead of accepting typed names
      const events = await buildEventQuickReply(supabase, state.owner);
      await replyWithQuickReply(lineToken, replyToken,
        '🎪 กรุณาเลือกงานจากปุ่มด้านล่าง (ไม่ต้องพิมพ์ชื่อเอง) ถ้ายังไม่รู้ให้กด "ยังไม่รู้"', events);
      return true;
    }
    if (draft.subcategory) {
      await finalizeExpense(supabase, lineToken, replyToken, lineUserId, state.owner, draft);
    } else {
      await setConvState(supabase, lineUserId, state.owner, 'awaiting_category', draft);
      await replyWithQuickReply(lineToken, replyToken, '📂 หมวดค่าใช้จ่าย?', getCategoryQuickReply());
    }
    return true;
  }

  if (state.state === 'awaiting_category') {
    const raw = text.startsWith('[CAT]') ? text.slice(5) : text;
    const cat = normalizeLineSubcategory(raw);
    if (!cat) {
      // Select-only: หมวดต้องมาจากปุ่มเท่านั้น
      await replyWithQuickReply(lineToken, replyToken,
        '📂 กรุณาเลือกหมวดค่าใช้จ่ายจากปุ่มด้านล่าง (ไม่ต้องพิมพ์เอง)', getCategoryQuickReply());
      return true;
    }
    draft.subcategory = cat;
    await finalizeExpense(supabase, lineToken, replyToken, lineUserId, state.owner, draft);
    return true;
  }

  return false;
}

async function finalizeExpense(
  supabase: any, lineToken: string, replyToken: string,
  lineUserId: string, owner: string, draft: any
) {
  const { data: staff } = await supabase.from('staff_profiles')
    .select('id, staff_name').eq('line_user_id', lineUserId).eq('user_id', owner).maybeSingle();

  if (staff) {
    const { error: claimErr } = await supabase.from('staff_expense_claims').insert({
      user_id: owner,
      staff_id: staff.id,
      expense_date: new Date().toISOString().split('T')[0],
      amount: draft.amount,
      description: draft.description,
      category: cleanText(draft.subcategory) || 'other_expense',
      event_name: cleanText(draft.event_name),
      project_tag: cleanText(draft.project_tag),
      status: 'submitted',
      notes: `[LINE] ${draft.raw_text}`,
    } as any);

    if (claimErr) {
      await replyToUser(lineToken, replyToken, `❌ บันทึกไม่สำเร็จ: ${claimErr.message}`);
      await clearConvState(supabase, lineUserId);
      return;
    }

    await clearConvState(supabase, lineUserId);
    const eventLine = draft.event_name ? `\n🎪 ${draft.event_name}` : '';
    await replyToUser(lineToken, replyToken,
      `✅ บันทึกค่าใช้จ่ายแล้ว!\n💰 ${Number(draft.amount).toLocaleString()} บาท\n📝 ${draft.description}\n📂 ${draft.subcategory || 'อื่นๆ'}${eventLine}\n\n⏳ รอแอดมินตรวจสอบ\n📸 ถ้ามีบิล/ใบเสร็จ ส่งรูปตามมาได้เลย`);
    await notifyAdminEvent(owner, {
      event_type: 'staff_claim_new',
      actor_kind: 'staff',
      actor_name: staff.staff_name || 'ทีมงาน',
      amount: Number(draft.amount) || 0,
      description: draft.description,
    });
    return;
  }

  const { data: vendor } = await supabase.from('vendor_profiles')
    .select('id, company_name').eq('line_user_id', lineUserId).eq('user_id', owner).maybeSingle();

  if (vendor) {
    const { error: invErr } = await supabase.from('vendor_invoices').insert({
      user_id: owner, vendor_id: vendor.id,
      document_type: 'receipt',
      amount: draft.amount, net_amount: draft.amount,
      description: draft.description,
      invoice_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      notes: `[LINE] ${draft.raw_text}${draft.event_name ? ` | ${draft.event_name}` : ''}${draft.subcategory ? ` | ${draft.subcategory}` : ''}`,
      submitted_via_line_user_id: lineUserId,
      submitted_via_line_display_name: vendor.company_name,
      link_type: 'vendor',
    } as any);
    if (invErr) {
      await replyToUser(lineToken, replyToken, `❌ บันทึกไม่สำเร็จ: ${invErr.message}`);
    } else {
      await replyToUser(lineToken, replyToken,
        `✅ บันทึกแล้ว!\n💰 ${Number(draft.amount).toLocaleString()} บาท\n📝 ${draft.description}\n⏳ รอแอดมินตรวจสอบ`);
      await notifyAdminEvent(owner, {
        event_type: 'vendor_bill_new',
        actor_kind: 'vendor',
        actor_name: vendor.company_name || 'คู่ค้า',
        amount: Number(draft.amount) || 0,
        description: draft.description,
      });
    }
    await clearConvState(supabase, lineUserId);
    return;
  }

  await replyToUser(lineToken, replyToken, '❌ ไม่พบบัญชีของคุณในระบบ กรุณาผูกบัญชีก่อน');
  await clearConvState(supabase, lineUserId);
}


// ============================================================
// แจ้งค่าจ้าง / สำรองจ่าย ทางไลน์ (ทีมงาน & ฟรีแลนซ์)
//   แบบ 1 wage_days   : แจ้งวันทำงาน → คิดจาก daily_rate → staff_invoices (หัก ณ ที่จ่าย)
//   แบบ 2 wage_amount : ค่าจ้างรายครั้ง → staff_invoices (หัก ณ ที่จ่าย)
//   แบบ 3 advance     : สำรองจ่าย → staff_expense_claims (ห้ามหักภาษี)
// ต้องทวนก่อนบันทึกทุกครั้ง — ห้ามบันทึกทันทีที่อ่าน
// ============================================================

const STAFF_WHT_RATE = 3; // ค่าจ้างบุคคลธรรมดา ม.40(2) / 3 เตรส
const THAI_MONTH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function thaiDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${THAI_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

const money = (n: number) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ทะเบียนงานที่กำลังทำอยู่ (−60 / +90 วัน) สำหรับ resolve รหัส @CODE */
async function resolveStaffEventTag(supabase: any, owner: string, text: string) {
  const codes = extractEventCodes(text);
  if (codes.length === 0) return { tag: null as string | null, eventName: null as string | null, status: 'none' as string };
  const { data: rows } = await supabase.from('event_registry')
    .select('project_tag, event_name, aliases').eq('user_id', owner).eq('is_active', true);
  const res = resolveEventCode(codes, rows || []);
  if (res.status === 'matched' && res.tag) {
    const hit = (rows || []).find((r: any) => r.project_tag === res.tag);
    return { tag: res.tag, eventName: hit?.event_name || null, status: 'matched' };
  }
  return { tag: null, eventName: null, status: res.status };
}

function staffKindQuickReply() {
  return [
    { label: '💼 ค่าจ้างทำงาน', data: '[SKIND]wage' },
    { label: '🧾 สำรองจ่าย (เบิกคืน)', data: '[SKIND]advance' },
    { label: 'ยกเลิก', data: 'ยกเลิก' },
  ];
}

/** ข้อความทวนก่อนบันทึก */
function staffDraftSummary(draft: any): string {
  const lines: string[] = ['รับแล้วนะคะ ตรวจหน่อยค่ะ'];
  if (draft.kind === 'advance') {
    lines.push('🧾 สำรองจ่าย (เบิกคืน · ไม่หักภาษี ณ ที่จ่าย)');
  } else {
    lines.push('💼 ค่าจ้างทำงาน (หัก ณ ที่จ่าย ' + STAFF_WHT_RATE + '%)');
  }
  if (draft.event_name || draft.project_tag) lines.push(`🎪 งาน ${draft.event_name || draft.project_tag}`);
  else lines.push('🎪 ยังไม่ระบุงาน (รอตรวจ)');
  if (draft.description) lines.push(`📝 ${draft.description}`);
  if (draft.work_start) {
    lines.push(draft.work_start === draft.work_end
      ? `📅 ${thaiDate(draft.work_start)}`
      : `📅 ${thaiDate(draft.work_start)} – ${thaiDate(draft.work_end)}`);
  }
  if (draft.kind === 'wage_days') {
    if (draft.gross_amount != null && draft.daily_rate) {
      lines.push(`${draft.days} วัน × ฿${money(draft.daily_rate)} = ฿${money(draft.gross_amount)}`);
      lines.push(`หัก ณ ที่จ่าย ฿${money(draft.wht_amount)} · รับสุทธิ ฿${money(draft.net_amount)}`);
    } else {
      lines.push(`${draft.days} วัน · ⚠️ ยังไม่มีค่าแรง/วันในทะเบียน — บันทึกวันไว้ก่อน เจ้าของจะใส่ยอดให้`);
    }
  } else if (draft.gross_amount != null) {
    lines.push(`💰 ฿${money(draft.gross_amount)}`);
    if (draft.kind !== 'advance') {
      lines.push(`หัก ณ ที่จ่าย ฿${money(draft.wht_amount)} · รับสุทธิ ฿${money(draft.net_amount)}`);
    } else {
      lines.push('ได้คืนเต็มจำนวน (ไม่หักภาษี)');
    }
  }
  lines.push('');
  lines.push('ถูกต้องไหมคะ? กดปุ่มด้านล่าง');
  return lines.join('\n');
}

function computeStaffAmounts(draft: any) {
  if (draft.kind === 'advance') {
    draft.wht_amount = 0;
    draft.net_amount = draft.gross_amount ?? null;
    return draft;
  }
  if (draft.gross_amount == null) {
    draft.wht_amount = null;
    draft.net_amount = null;
    return draft;
  }
  const gross = Number(draft.gross_amount);
  const wht = Math.round(gross * STAFF_WHT_RATE) / 100;
  draft.wht_amount = wht;
  draft.net_amount = Math.round((gross - wht) * 100) / 100;
  return draft;
}

async function askStaffConfirm(
  supabase: any, token: string, replyToken: string, lineUserId: string, owner: string, draft: any,
) {
  computeStaffAmounts(draft);
  await setConvState(supabase, lineUserId, owner, 'awaiting_staff_confirm', draft, 24 * 60);
  await supabase.from('line_pending_billings').delete().eq('line_user_id', lineUserId).in('kind', ['staff_wage', 'staff_advance']);
  await supabase.from('line_pending_billings').insert({
    line_user_id: lineUserId,
    kind: draft.kind === 'advance' ? 'staff_advance' : 'staff_wage',
    amount: draft.gross_amount ?? null,
    description: (draft.description || '').slice(0, 300),
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  } as any);
  await replyWithQuickReply(token, replyToken, staffDraftSummary(draft), [
    { label: '✅ ถูกต้อง', data: '[SOK]' },
    { label: '✏️ แก้ไข', data: '[SEDIT]' },
  ]);
}

/** เริ่มโฟลว์จากข้อความอิสระของทีมงาน */
async function startStaffBillingFlow(
  supabase: any, token: string, replyToken: string, lineUserId: string,
  profile: LineProfile, text: string,
): Promise<boolean> {
  const parsed = parseStaffMessage(text);
  const staff = profile.profile || {};
  const ev = await resolveStaffEventTag(supabase, profile.owner, text);

  const draft: Record<string, any> = {
    flow: 'staff_billing',
    kind: parsed.kind,
    staff_id: profile.profileId,
    staff_name: staff.staff_name || profile.displayName || 'ทีมงาน',
    daily_rate: Number(staff.daily_rate) > 0 ? Number(staff.daily_rate) : null,
    description: parsed.description || text,
    work_start: parsed.workStart,
    work_end: parsed.workEnd,
    days: parsed.days,
    gross_amount: parsed.amount,
    project_tag: ev.tag,
    event_name: ev.eventName,
    event_status: ev.status,
    raw_text: text,
  };

  // แบบที่ 1: คิดจากค่าแรง/วันในทะเบียน — ถ้าไม่มี ห้ามเดายอด
  if (draft.kind === 'wage_days') {
    draft.gross_amount = draft.daily_rate && draft.days ? draft.daily_rate * draft.days : null;
  }

  // ไม่แน่ใจว่าเป็นแบบไหน → ถามด้วยปุ่ม ห้ามเดา
  if (draft.kind === 'unknown') {
    await setConvState(supabase, lineUserId, profile.owner, 'awaiting_staff_kind', draft, 24 * 60);
    await replyWithQuickReply(token, replyToken,
      `📝 ${draft.description || text}\n\nรายการนี้เป็นแบบไหนคะ?\n· ค่าจ้างทำงาน = หัก ณ ที่จ่าย\n· สำรองจ่าย = เงินที่ออกไปก่อนแล้วเบิกคืน (ไม่หักภาษี)`,
      staffKindQuickReply());
    return true;
  }

  // ไม่มีรหัสงาน → ถามด้วยปุ่มรายชื่องานที่กำลังทำอยู่ ห้ามเดาจากข้อความ
  if (!draft.project_tag) {
    const events = await buildEventQuickReply(supabase, profile.owner);
    await setConvState(supabase, lineUserId, profile.owner, 'awaiting_staff_event', draft, 24 * 60);
    const warn = ev.status === 'unknown' ? '⚠️ รหัสงานที่ส่งมาไม่มีในทะเบียน\n'
      : ev.status === 'ambiguous' ? '⚠️ พบรหัสงานหลายตัว กรุณาเลือกงานเดียว\n' : '';
    await replyWithQuickReply(token, replyToken, `${warn}🎪 รายการนี้ของงานไหนคะ? (เลือกจากปุ่ม)`, events);
    return true;
  }

  await askStaffConfirm(supabase, token, replyToken, lineUserId, profile.owner, draft);
  return true;
}

async function handleStaffBillingConvReply(
  supabase: any, token: string, replyToken: string, lineUserId: string, state: any, text: string,
): Promise<boolean> {
  const draft = state.draft_data || {};
  if (draft.flow !== 'staff_billing') return false;
  const owner = state.owner;

  if (state.state === 'awaiting_staff_kind') {
    if (!text.startsWith('[SKIND]')) {
      await replyWithQuickReply(token, replyToken, 'กรุณาเลือกจากปุ่มด้านล่างค่ะ', staffKindQuickReply());
      return true;
    }
    const pick = text.slice(7);
    if (pick === 'advance') {
      draft.kind = 'advance';
    } else {
      draft.kind = draft.work_start && draft.gross_amount == null ? 'wage_days' : 'wage_amount';
      if (draft.kind === 'wage_days') {
        draft.gross_amount = draft.daily_rate && draft.days ? draft.daily_rate * draft.days : null;
      }
    }
    if (!draft.project_tag) {
      const events = await buildEventQuickReply(supabase, owner);
      await setConvState(supabase, lineUserId, owner, 'awaiting_staff_event', draft, 24 * 60);
      await replyWithQuickReply(token, replyToken, '🎪 รายการนี้ของงานไหนคะ? (เลือกจากปุ่ม)', events);
      return true;
    }
    if (draft.kind !== 'wage_days' && draft.gross_amount == null) {
      await setConvState(supabase, lineUserId, owner, 'awaiting_staff_amount', draft, 24 * 60);
      await replyToUser(token, replyToken, '💰 ยอดเงินเท่าไหร่คะ? (พิมพ์ตัวเลข เช่น 3500)');
      return true;
    }
    await askStaffConfirm(supabase, token, replyToken, lineUserId, owner, draft);
    return true;
  }

  if (state.state === 'awaiting_staff_event') {
    if (!text.startsWith('[EVENT]')) {
      const events = await buildEventQuickReply(supabase, owner);
      await replyWithQuickReply(token, replyToken,
        '🎪 กรุณาเลือกงานจากปุ่มด้านล่าง (ไม่ต้องพิมพ์ชื่อเอง) ถ้ายังไม่รู้ให้กด "ยังไม่รู้"', events);
      return true;
    }
    const [tag, name] = text.slice(7).split('|');
    if (tag === 'UNKNOWN') {
      draft.project_tag = null;
      draft.event_name = null;
      draft.needs_review = true;
    } else {
      draft.project_tag = tag;
      draft.event_name = name || tag;
    }
    if (draft.kind !== 'wage_days' && draft.gross_amount == null) {
      await setConvState(supabase, lineUserId, owner, 'awaiting_staff_amount', draft, 24 * 60);
      await replyToUser(token, replyToken, '💰 ยอดเงินเท่าไหร่คะ? (พิมพ์ตัวเลข เช่น 3500)');
      return true;
    }
    await askStaffConfirm(supabase, token, replyToken, lineUserId, owner, draft);
    return true;
  }

  if (state.state === 'awaiting_staff_amount') {
    const n = Number((text || '').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      await replyToUser(token, replyToken, '❌ ยอดเงินไม่ถูกต้อง กรุณาพิมพ์เป็นตัวเลข เช่น 3500');
      return true;
    }
    draft.gross_amount = n;
    await askStaffConfirm(supabase, token, replyToken, lineUserId, owner, draft);
    return true;
  }

  if (state.state === 'awaiting_staff_confirm') {
    if (text.startsWith('[SOK]') || /^(ถูกต้อง|ใช่|ยืนยัน|ok)$/i.test(text)) {
      await finalizeStaffBilling(supabase, token, replyToken, lineUserId, owner, draft);
      return true;
    }
    if (text.startsWith('[SEDIT]') || /^(แก้ไข|แก้|edit)$/i.test(text)) {
      await setConvState(supabase, lineUserId, owner, 'awaiting_staff_rewrite', draft, 24 * 60);
      await replyToUser(token, replyToken,
        '✏️ พิมพ์รายการใหม่ทั้งบรรทัดได้เลยค่ะ\nเช่น "@MRN ทำงาน 20-22 ส.ค." หรือ "@MRN ค่าถ่ายรูป 22 ส.ค. 3500"\nถ้าจะแก้แค่ยอด พิมพ์ตัวเลขยอดใหม่ก็ได้ค่ะ');
      return true;
    }
    await replyWithQuickReply(token, replyToken, staffDraftSummary(draft), [
      { label: '✅ ถูกต้อง', data: '[SOK]' },
      { label: '✏️ แก้ไข', data: '[SEDIT]' },
    ]);
    return true;
  }

  if (state.state === 'awaiting_staff_rewrite') {
    const onlyNumber = /^[\d,\.]+$/.test(text.trim());
    if (onlyNumber) {
      const n = Number(text.replace(/[^\d.]/g, ''));
      if (n > 0) {
        draft.gross_amount = n;
        if (draft.kind === 'wage_days') draft.kind = 'wage_amount';
        await askStaffConfirm(supabase, token, replyToken, lineUserId, owner, draft);
        return true;
      }
    }
    const staffProfile: LineProfile = {
      kind: 'staff', owner, displayName: draft.staff_name, profileId: draft.staff_id,
      profile: { staff_name: draft.staff_name, daily_rate: draft.daily_rate },
    };
    await startStaffBillingFlow(supabase, token, replyToken, lineUserId, staffProfile, text);
    return true;
  }

  return false;
}

/** บันทึกจริงหลังยืนยัน + ออกเลขรับ S00xx */
async function finalizeStaffBilling(
  supabase: any, token: string, replyToken: string, lineUserId: string, owner: string, draft: any,
) {
  computeStaffAmounts(draft);
  const needsReview = !draft.project_tag || draft.gross_amount == null;

  // ---- แบบที่ 3: สำรองจ่าย → เบิกคืนเต็มจำนวน ห้ามหักภาษี ณ ที่จ่าย ----
  if (draft.kind === 'advance') {
    const { error } = await supabase.from('staff_expense_claims').insert({
      user_id: owner,
      staff_id: draft.staff_id,
      category: 'other_expense',
      description: draft.description || draft.raw_text,
      amount: draft.gross_amount,
      expense_date: draft.work_start || new Date().toISOString().split('T')[0],
      event_name: cleanText(draft.event_name),
      project_tag: cleanText(draft.project_tag),
      has_formal_receipt: false,
      status: 'submitted',
      wht_amount: 0,
      wht_rate: 0,
      source: 'line',
      line_raw_text: draft.raw_text,
      line_sender_user_id: lineUserId,
      notes: draft.project_tag ? null : 'ยังไม่ระบุงาน — รอตรวจ',
    } as any);
    await clearConvState(supabase, lineUserId);
    await supabase.from('line_pending_billings').delete().eq('line_user_id', lineUserId).in('kind', ['staff_wage', 'staff_advance']);
    if (error) {
      await replyToUser(token, replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    await replyToUser(token, replyToken,
      `✅ บันทึกรายการสำรองจ่ายแล้วค่ะ\n💰 ฿${money(draft.gross_amount)} (คืนเต็มจำนวน ไม่หักภาษี)\n📝 ${draft.description}\n⏳ รอตรวจสอบ\n\n📸 ถ้ามีใบเสร็จ ส่งรูปตามมาได้เลยค่ะ`);
    await notifyAdminEvent(owner, {
      event_type: 'staff_claim_new', actor_kind: 'staff', actor_name: draft.staff_name,
      amount: Number(draft.gross_amount) || 0, description: `[สำรองจ่าย] ${draft.description}`,
    });
    return;
  }

  // ---- แบบที่ 1 / 2: ค่าจ้าง → staff_invoices + หัก ณ ที่จ่าย ----
  const { data: receiptNo } = await supabase.rpc('next_staff_receipt_no');
  const recNo = receiptNo || `S-${Date.now()}`;
  const { error } = await supabase.from('staff_invoices').insert({
    user_id: owner,
    staff_id: draft.staff_id,
    invoice_number: recNo,
    receipt_no: recNo,
    event_name: cleanText(draft.event_name),
    days_worked: draft.days ?? null,
    daily_rate: draft.daily_rate ?? null,
    gross_amount: draft.gross_amount,
    wht_rate: draft.gross_amount == null ? STAFF_WHT_RATE : STAFF_WHT_RATE,
    wht_amount: draft.wht_amount ?? 0,
    net_amount: draft.net_amount,
    bonus_amount: 0,
    status: 'submitted',
    work_start_date: draft.work_start,
    work_end_date: draft.work_end,
    submitted_via: 'line',
    submitted_via_line_user_id: lineUserId,
    submitted_at: new Date().toISOString(),
    work_days_note: draft.raw_text,
    notes: [
      draft.project_tag ? `งาน ${draft.project_tag}` : 'ยังไม่ระบุงาน — รอตรวจ',
      draft.gross_amount == null ? 'ยังไม่มีค่าแรง/วันในทะเบียน — รอเจ้าของใส่ยอด' : null,
      `[LINE] ${draft.raw_text}`,
    ].filter(Boolean).join(' | '),
  } as any);

  await clearConvState(supabase, lineUserId);
  await supabase.from('line_pending_billings').delete().eq('line_user_id', lineUserId).in('kind', ['staff_wage', 'staff_advance']);

  if (error) {
    await replyToUser(token, replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);
    return;
  }

  const amountLine = draft.gross_amount == null
    ? '⚠️ ยังไม่มียอด (บันทึกวันทำงานไว้แล้ว รอเจ้าของใส่ค่าแรง)'
    : `฿${money(draft.gross_amount)} · หัก ณ ที่จ่าย ฿${money(draft.wht_amount)} · รับสุทธิ ฿${money(draft.net_amount)}`;
  await replyToUser(token, replyToken,
    `✅ บันทึกแล้วค่ะ เลขที่ ${recNo}\n${amountLine}\n⏳ รอตรวจสอบ${needsReview ? '\n⚠️ มีข้อมูลรอเติมให้ครบ' : ''}`);
  await notifyAdminEvent(owner, {
    event_type: 'staff_invoice_new', actor_kind: 'staff', actor_name: draft.staff_name,
    amount: Number(draft.gross_amount) || 0,
    description: `${recNo} · ${draft.description || ''}${draft.gross_amount == null ? ' (ยังไม่มียอด)' : ''}`,
  });
}

/** เตือนร่างที่ค้างเกิน 12 ชม. หนึ่งครั้ง (ไม่มีการบันทึกอัตโนมัติ) */
async function sweepStaffDraftReminders(supabase: any, token: string) {
  try {
    const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data: drafts } = await supabase.from('line_pending_billings')
      .select('id, line_user_id, kind, amount, description, created_at')
      .in('kind', ['staff_wage', 'staff_advance'])
      .is('reminded_at', null)
      .lt('created_at', cutoff)
      .gt('expires_at', new Date().toISOString())
      .limit(10);
    for (const d of drafts || []) {
      await pushTextToUser(token, d.line_user_id,
        `⏰ ยังมีรายการที่รอยืนยันค่ะ\n📝 ${d.description || '-'}${d.amount ? `\n💰 ฿${money(Number(d.amount))}` : ''}\n\nพิมพ์ "ถูกต้อง" เพื่อบันทึก หรือ "แก้ไข" เพื่อแก้ (ถ้าไม่ยืนยันภายใน 24 ชม. ระบบจะไม่บันทึกให้ค่ะ)`);
      await supabase.from('line_pending_billings').update({ reminded_at: new Date().toISOString() } as any).eq('id', d.id);
    }
  } catch (e) {
    console.error('sweepStaffDraftReminders error:', e);
  }
}
