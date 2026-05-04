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
    const {
      staff_id,
      payment_method,
      gross_amount,
      wht_amount,
      net_amount,
      paid_at,
      invoice_number,
      event_name,
    } = await req.json();

    if (!staff_id) {
      return new Response(JSON.stringify({ ok: false, error: 'staff_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get staff's LINE user ID
    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('staff_name, line_user_id')
      .eq('id', staff_id)
      .maybeSingle();

    if (!staff?.line_user_id) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no LINE ID', staff_name: staff?.staff_name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format Thai Buddhist date/time
    const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const d = paid_at ? new Date(paid_at) : new Date();
    const dateStr = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
    const fmt = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const headerText = payment_method === 'cash'
      ? '✅ บันทึกการจ่ายเงินสดแล้ว'
      : payment_method === 'credit'
        ? '📝 บันทึกเป็นเครดิตแล้ว (ยังไม่ได้โอน)'
        : '✅ โอนเงินค่าจ้างเรียบร้อยแล้ว';

    const lines: string[] = [headerText, ''];
    if (invoice_number) lines.push(`📋 บิล: ${invoice_number}`);
    lines.push(`📅 วันที่: ${dateStr} เวลา ${timeStr}`);
    if (event_name) lines.push(`🎪 งาน: ${event_name}`);
    lines.push('');
    if (gross_amount != null) lines.push(`💰 ยอดเต็ม: ${fmt(gross_amount)} บาท`);
    if (wht_amount != null && Number(wht_amount) > 0) {
      lines.push(`➖ หัก ณ ที่จ่าย: ${fmt(wht_amount)} บาท`);
    }
    lines.push('─────────────');
    if (net_amount != null) lines.push(`💵 ยอดสุทธิ: ${fmt(net_amount)} บาท`);
    lines.push('');
    lines.push('ขอบคุณที่มาช่วยกันจัดงานดีๆให้เด็กๆนะคะ 🙏❤️');

    const messages = [{ type: 'text', text: lines.join('\n') }];

    // Push to staff LINE
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({ to: staff.line_user_id, messages }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('LINE push failed:', errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Payment notification sent to ${staff.staff_name} (${staff.line_user_id})`);
    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
