import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType =
  | 'link_success'
  | 'new_registration'
  | 'vendor_bill_new'
  | 'staff_claim_new';

interface Payload {
  owner_user_id: string;
  event_type: EventType;
  // Common fields
  actor_name?: string;       // Staff or vendor name
  actor_kind?: 'staff' | 'vendor';
  // Bill / claim specifics
  amount?: number;
  invoice_number?: string;
  description?: string;
  // Deep link to open in admin
  deep_link?: string;
}

function fmtMoney(n?: number): string {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildMessage(p: Payload): string | null {
  const kindIcon = p.actor_kind === 'vendor' ? '🏢' : '👤';
  const who = p.actor_name || (p.actor_kind === 'vendor' ? 'คู่ค้า' : 'ทีมงาน');

  switch (p.event_type) {
    case 'link_success':
      return `🔗 ${kindIcon} ${who} ผูก LINE กับระบบเรียบร้อย`;
    case 'new_registration':
      return `🆕 ${kindIcon} ${who} ลงทะเบียนใหม่ผ่าน LINE`;
    case 'vendor_bill_new': {
      const lines = [
        `🧾 ${kindIcon} ${who} ส่งบิลใหม่`,
        `💰 ฿${fmtMoney(p.amount)}`,
      ];
      if (p.invoice_number) lines.push(`📄 เลขที่: ${p.invoice_number}`);
      if (p.description) lines.push(`📝 ${p.description}`);
      if (p.deep_link) lines.push(`🔗 ${p.deep_link}`);
      return lines.join('\n');
    }
    case 'staff_claim_new': {
      const lines = [
        `💰 👤 ${who} แจ้งเบิก/ค่าใช้จ่าย`,
        `ยอด: ฿${fmtMoney(p.amount)}`,
      ];
      if (p.description) lines.push(`📝 ${p.description}`);
      if (p.deep_link) lines.push(`🔗 ${p.deep_link}`);
      return lines.join('\n');
    }
    default:
      return null;
  }
}

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

    const payload = await req.json() as Payload;
    if (!payload?.owner_user_id || !payload?.event_type) {
      return new Response(JSON.stringify({ ok: false, error: 'owner_user_id and event_type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = buildMessage(payload);
    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: 'unknown event_type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find all super_admin LINE IDs
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

    const lineIds = Array.from(new Set((mappings ?? []).map((m: any) => m.line_user_id).filter(Boolean)));
    if (lineIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no LINE mapping for admins' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    console.error('notify-admin-event error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});