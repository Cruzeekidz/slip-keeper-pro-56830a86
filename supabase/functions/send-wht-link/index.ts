import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    if (!lineToken) {
      return new Response(JSON.stringify({ ok: false, error: 'LINE token not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { cert_id } = await req.json();
    if (!cert_id) {
      return new Response(JSON.stringify({ ok: false, error: 'cert_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get certificate
    const { data: cert } = await supabase
      .from('wht_certificates')
      .select('*')
      .eq('id', cert_id)
      .eq('user_id', user.id)
      .single();

    if (!cert) {
      return new Response(JSON.stringify({ ok: false, error: 'Certificate not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!cert.flowaccount_url) {
      return new Response(JSON.stringify({ ok: false, sent: false, reason: 'No FlowAccount URL' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find LINE user ID from staff or vendor profiles
    let lineUserId: string | null = null;

    if (cert.payee_source === 'staff' && cert.payee_source_id) {
      const { data: staff } = await supabase
        .from('staff_profiles')
        .select('line_user_id, staff_name')
        .eq('id', cert.payee_source_id)
        .maybeSingle();
      lineUserId = staff?.line_user_id || null;
    } else if (cert.payee_source === 'vendor' && cert.payee_source_id) {
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('line_user_id, company_name')
        .eq('id', cert.payee_source_id)
        .maybeSingle();
      lineUserId = vendor?.line_user_id || null;
    }

    // Fallback: search by name
    if (!lineUserId) {
      const { data: staffByName } = await supabase
        .from('staff_profiles')
        .select('line_user_id')
        .eq('user_id', user.id)
        .ilike('staff_name', cert.payee_name)
        .not('line_user_id', 'is', null)
        .limit(1);
      if (staffByName && staffByName.length > 0) lineUserId = staffByName[0].line_user_id;
    }
    if (!lineUserId) {
      const { data: vendorByName } = await supabase
        .from('vendor_profiles')
        .select('line_user_id')
        .eq('user_id', user.id)
        .ilike('company_name', cert.payee_name)
        .not('line_user_id', 'is', null)
        .limit(1);
      if (vendorByName && vendorByName.length > 0) lineUserId = vendorByName[0].line_user_id;
    }

    if (!lineUserId) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'ไม่พบ LINE ID ของผู้รับ กรุณาตรวจสอบข้อมูลทีมงาน/คู่ค้า' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send LINE message
    const taxText = cert.total_tax ? ` (ภาษีหัก ${Number(cert.total_tax).toLocaleString()} บาท)` : '';
    const messages = [{
      type: "text",
      text: `📄 ใบหัก ณ ที่จ่าย\nสำหรับ: ${cert.payee_name}${taxText}\n\n🔗 ดูเอกสาร: ${cert.flowaccount_url}`,
    }];

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({ to: lineUserId, messages }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('LINE push failed:', errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as sent
    await supabase.from('wht_certificates').update({
      sent_to_payee: true,
      sent_at: new Date().toISOString(),
    } as any).eq('id', cert_id);

    console.log(`WHT link sent to ${cert.payee_name} (${lineUserId})`);
    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
