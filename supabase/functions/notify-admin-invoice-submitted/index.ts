import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!lineToken) {
      return new Response(JSON.stringify({ ok: false, error: 'LINE token not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      owner_user_id,
      staff_name,
      invoice_number,
      event_name,
      gross_amount,
      wht_amount,
      net_amount,
      expense_total,
      grand_total,
      submitted_via,
    } = await req.json();

    if (!owner_user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'owner_user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find all super_admin LINE IDs for this workspace owner
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'super_admin');

    const adminIds = (roles ?? []).map((r: any) => r.user_id);
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no super_admin' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: mappings } = await supabase
      .from('line_user_mappings')
      .select('line_user_id')
      .in('supabase_user_id', adminIds);

    const lineIds = (mappings ?? []).map((m: any) => m.line_user_id).filter(Boolean);
    if (lineIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no LINE mapping for admins' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const d = new Date();
    const dateStr = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const fmt = (n: any) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const lines: string[] = [
      '🔔 มีใบเรียกเก็บเงินใหม่จากทีมงาน',
      '',
      `👤 ทีมงาน: ${staff_name ?? '-'}`,
    ];
    if (invoice_number) lines.push(`📋 บิล: ${invoice_number}`);
    if (event_name) lines.push(`🎪 งาน: ${event_name}`);
    lines.push(`📅 ส่งเมื่อ: ${dateStr} ${timeStr} น.`);
    lines.push('─────────────');
    if (gross_amount != null) lines.push(`💰 ยอดเต็ม: ${fmt(gross_amount)} บาท`);
    if (wht_amount != null && Number(wht_amount) > 0) lines.push(`➖ หัก ณ ที่จ่าย: ${fmt(wht_amount)} บาท`);
    if (net_amount != null) lines.push(`💵 ค่าแรงสุทธิ: ${fmt(net_amount)} บาท`);
    if (expense_total != null && Number(expense_total) > 0) lines.push(`🧾 ค่าใช้จ่ายอื่น: ${fmt(expense_total)} บาท`);
    if (grand_total != null) {
      lines.push('─────────────');
      lines.push(`✅ รวมทั้งสิ้น: ${fmt(grand_total)} บาท`);
    }
    lines.push('');
    lines.push('เปิดระบบเพื่อตรวจสอบและอนุมัติได้เลยค่ะ 🙏');

    const text = lines.join('\n');
    let sent = 0;
    const failures: string[] = [];
    for (const to of lineIds) {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      });
      if (res.ok) sent++;
      else failures.push(`${to}: ${await res.text()}`);
    }

    return new Response(JSON.stringify({ ok: true, sent, total: lineIds.length, failures }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('notify-admin-invoice-submitted error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});