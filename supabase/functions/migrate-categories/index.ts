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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    }).auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('id, category, subcategory, project, description, merchant, receiver, sender, amount')
      .eq('user_id', user.id)
      .is('transaction_type', null);

    if (error) throw error;

    let migrated = 0;

    for (const exp of (expenses || [])) {
      const classification = classifyExpense(exp);
      const { error: updateError } = await supabase
        .from('expenses')
        .update({
          transaction_type: classification.transaction_type,
          category_group: classification.category_group,
          project_tag: classification.project_tag,
          subcategory: classification.subcategory || undefined,
          needs_review: classification.needs_review,
        })
        .eq('id', exp.id);

      if (!updateError) migrated++;
    }

    return new Response(
      JSON.stringify({ success: true, total: expenses?.length || 0, migrated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

interface ExpenseInput {
  category: string;
  subcategory: string | null;
  project: string | null;
  description: string | null;
  merchant: string | null;
  receiver: string | null;
  sender: string | null;
  amount: number;
}

function classifyExpense(exp: ExpenseInput): {
  transaction_type: string;
  category_group: string | null;
  project_tag: string | null;
  subcategory: string | null;
  needs_review: boolean;
} {
  const cat = (exp.category || '').toLowerCase();
  const desc = (exp.description || '').toLowerCase();
  const merchant = (exp.merchant || '').toLowerCase();
  const receiver = (exp.receiver || '').toLowerCase();
  const project = (exp.project || '').toLowerCase();
  const combined = `${cat} ${desc} ${merchant} ${receiver} ${project}`;

  // === TRANSFER ===
  if (cat.includes('โอนเงินระหว่างบัญชี') || cat.includes('โอนข้ามบัญชี') || cat === 'การโอนเงินระหว่างบัญชี') {
    return { transaction_type: 'TRANSFER', category_group: null, project_tag: null, subcategory: 'โอนข้ามบัญชี', needs_review: false };
  }
  if (combined.includes('cardx') || combined.includes('บัตรเครดิต') || 
      (receiver.includes('scb') || receiver.includes('ยูโอบี') || receiver.includes('กรุงศรี') || receiver.includes('uob') || receiver.includes('krungsri')) && exp.amount >= 5000) {
    return { transaction_type: 'TRANSFER', category_group: null, project_tag: null, subcategory: 'จ่ายบัตรเครดิต', needs_review: false };
  }
  if ((desc.includes('คืนหนี้') || desc.includes('เงินยืม')) || receiver.includes('mrs. orawan') || receiver.includes('orawan')) {
    return { transaction_type: 'TRANSFER', category_group: null, project_tag: null, subcategory: 'คืนหนี้/เงินยืม', needs_review: false };
  }
  if (combined.includes('ลีสซิ่ง') || combined.includes('ค่างวดรถ')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Vehicle', needs_review: false };
  }
  if (combined.includes('ผ่อน')) {
    return { transaction_type: 'TRANSFER', category_group: null, project_tag: null, subcategory: 'ผ่อนชำระ', needs_review: false };
  }

  // === BUSINESS - ENTITY: คู่ขนาน ===
  if (combined.includes('คู่ขนาน') && (combined.includes('พระราม') || cat.includes('คู่ขนาน'))) {
    return { transaction_type: 'BUSINESS', category_group: 'ENTITY_KUKANANG', project_tag: null, subcategory: classifyEntitySubcategory(combined), needs_review: false };
  }

  // === Utilities (3BB, AIS, TRUE) → GENERAL ===
  if (combined.includes('3bb') || combined.includes('ทริปเปิลที') || combined.includes('true') || combined.includes('ais fibre') || combined.includes('ais ') || combined.includes('internet') || combined.includes('ค่าเน็ต')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Utilities', needs_review: false };
  }

  // === BUSINESS EVENT ===
  if (combined.includes('rockstar') || combined.includes('kmt')) {
    let eventTag = 'EVT-Other';
    if (combined.includes('rockstar')) eventTag = 'EVT-Rockstar3';
    else if (combined.includes('kmt')) eventTag = 'EVT-KMT41';
    return { transaction_type: 'BUSINESS', category_group: 'EVENT', project_tag: eventTag, subcategory: classifyEventSubcategory(combined), needs_review: false };
  }

  // === BUSINESS PROGRAM ===
  if (combined.includes('bike') || combined.includes('จักรยาน') || combined.includes('bikeclass') || combined.includes('ครูนัท') || combined.includes('สอน')) {
    return { transaction_type: 'BUSINESS', category_group: 'PROGRAM', project_tag: 'PROG-BikeClass', subcategory: classifyProgramSubcategory(combined), needs_review: false };
  }
  if (combined.includes('inline') || combined.includes('สเก็ต')) {
    return { transaction_type: 'BUSINESS', category_group: 'PROGRAM', project_tag: 'PROG-InlineSkate', subcategory: classifyProgramSubcategory(combined), needs_review: false };
  }

  // === BUSINESS VENUE ===
  if (combined.includes('สนามจักรยาน') || combined.includes('สนาม')) {
    return { transaction_type: 'BUSINESS', category_group: 'VENUE', project_tag: null, subcategory: classifyVenueSubcategory(combined), needs_review: false };
  }

  // === BUSINESS GENERAL ===
  if (combined.includes('เงินเดือน') || combined.includes('salary') || receiver.includes('ปรียารัตน') || receiver.includes('piyanan')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Salary', needs_review: false };
  }
  if (combined.includes('facebook') || combined.includes('ads') || combined.includes('โฆษณา') || merchant.includes('ufu asia') || merchant.includes('meta')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Marketing & Ads', needs_review: false };
  }
  if (combined.includes('accounting') || combined.includes('บัญชี') || combined.includes('s(group)')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Accounting', needs_review: false };
  }
  if (combined.includes('ที่ปรึกษา') || combined.includes('consulting') || combined.includes('be better than')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Consulting', needs_review: false };
  }
  if (combined.includes('vehicle') || combined.includes('ลีสซิ่งกสิกร')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Vehicle', needs_review: false };
  }
  if (combined.includes('software') || combined.includes('subscription') || combined.includes('canva') || combined.includes('google workspace')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Software & Subscription', needs_review: false };
  }
  if (combined.includes('logistics') || combined.includes('ขนส่ง') || combined.includes('shipping')) {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: 'Logistics', needs_review: false };
  }
  if (cat.includes('บริษัท') || cat.includes('company') || cat === 'ค่าใช้จ่ายบริษัท') {
    return { transaction_type: 'BUSINESS', category_group: 'GENERAL', project_tag: null, subcategory: exp.subcategory || 'Other', needs_review: true };
  }

  // === PERSONAL ===
  if (cat.includes('ส่วนตัว') || cat === 'personal' || cat === 'ค่าใช้จ่ายส่วนตัว') {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: classifyPersonalSubcategory(combined, exp.subcategory), needs_review: false };
  }
  if (combined.includes('อาหาร') || combined.includes('ส้มตำ') || combined.includes('ก๋วยเตี๋ยว') || combined.includes('ผลไม้') || combined.includes('food') || combined.includes('กาแฟ') || combined.includes('coffee')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Food & Drinks', needs_review: false };
  }
  if (combined.includes('bts') || combined.includes('rabbit') || combined.includes('ค่าจอดรถ') || combined.includes('น้ำมัน') || combined.includes('grab') || combined.includes('bolt')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Transport', needs_review: false };
  }
  if (combined.includes('skincare') || combined.includes('rangsima') || combined.includes('สุขภาพ') || combined.includes('ยา') || combined.includes('หมอ')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Health & Wellness', needs_review: false };
  }
  if (combined.includes('ทำบุญ') || combined.includes('ดอกคำ') || combined.includes('donation')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Donation', needs_review: false };
  }
  if (combined.includes('workshop') || combined.includes('anatomy') || combined.includes('course') || combined.includes('เรียน')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Self-Development', needs_review: false };
  }
  if (combined.includes('wisora') || combined.includes('trip') || combined.includes('ท่องเที่ยว') || combined.includes('entertainment')) {
    return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Entertainment', needs_review: false };
  }

  return { transaction_type: 'PERSONAL', category_group: null, project_tag: null, subcategory: 'Other', needs_review: true };
}

function classifyEventSubcategory(combined: string): string {
  if (combined.includes('print') || combined.includes('พิมพ์') || combined.includes('poster') || combined.includes('inkjet')) return 'Printing';
  if (combined.includes('staff') || combined.includes('ค่าแรง') || combined.includes('พนักงาน')) return 'Staff';
  if (combined.includes('venue') || combined.includes('สถานที่')) return 'Venue';
  if (combined.includes('prize') || combined.includes('รางวัล')) return 'Prizes';
  if (combined.includes('transport') || combined.includes('ขนส่ง')) return 'Transport';
  if (combined.includes('marketing') || combined.includes('โฆษณา')) return 'Marketing';
  if (combined.includes('refund') || combined.includes('คืนเงิน')) return 'Refund';
  return 'Other';
}

function classifyProgramSubcategory(combined: string): string {
  if (combined.includes('staff') || combined.includes('ครู') || combined.includes('สอน') || combined.includes('coach')) return 'Staff';
  if (combined.includes('equipment') || combined.includes('อุปกรณ์')) return 'Equipment';
  if (combined.includes('venue') || combined.includes('สถานที่') || combined.includes('สนาม')) return 'Venue';
  return 'Other';
}

function classifyVenueSubcategory(combined: string): string {
  if (combined.includes('stock') || combined.includes('น้ำ') || combined.includes('ไอติม') || combined.includes('สินค้า')) return 'Stock (น้ำ/ไอติม)';
  if (combined.includes('maintenance') || combined.includes('ซ่อม')) return 'Maintenance';
  if (combined.includes('utilities') || combined.includes('ค่าน้ำ') || combined.includes('ค่าไฟ')) return 'Utilities';
  return 'Other';
}

function classifyEntitySubcategory(combined: string): string {
  if (combined.includes('staff') || combined.includes('ครู') || combined.includes('พนักงาน')) return 'Staff';
  if (combined.includes('venue') || combined.includes('สถานที่')) return 'Venue';
  if (combined.includes('equipment') || combined.includes('อุปกรณ์')) return 'Equipment';
  if (combined.includes('marketing') || combined.includes('โฆษณา')) return 'Marketing';
  if (combined.includes('utilities') || combined.includes('ค่าน้ำ') || combined.includes('ค่าไฟ') || combined.includes('ค่าเน็ต')) return 'Utilities';
  return 'Other';
}

function classifyPersonalSubcategory(combined: string, existing: string | null): string {
  if (combined.includes('อาหาร') || combined.includes('food') || combined.includes('กาแฟ')) return 'Food & Drinks';
  if (combined.includes('สุขภาพ') || combined.includes('health') || combined.includes('skincare')) return 'Health & Wellness';
  if (combined.includes('transport') || combined.includes('bts') || combined.includes('ค่าจอด') || combined.includes('น้ำมัน')) return 'Transport';
  if (combined.includes('ลูก') || combined.includes('family') || combined.includes('kids')) return 'Family & Kids';
  if (combined.includes('workshop') || combined.includes('เรียน') || combined.includes('course')) return 'Self-Development';
  if (combined.includes('ทำบุญ') || combined.includes('donation')) return 'Donation';
  if (combined.includes('entertainment') || combined.includes('trip') || combined.includes('ท่องเที่ยว')) return 'Entertainment';
  if (combined.includes('insurance') || combined.includes('ประกัน')) return 'Insurance';
  if (combined.includes('shopping') || combined.includes('ซื้อของ')) return 'Shopping';
  if (existing) return existing;
  return 'Other';
}
