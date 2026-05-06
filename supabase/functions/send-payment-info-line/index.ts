import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { message, recipient_ids } = await req.json();
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'message required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let query = supabase.from('forward_recipients')
      .select('line_user_id, display_name')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (Array.isArray(recipient_ids) && recipient_ids.length > 0) {
      query = query.in('id', recipient_ids);
    }
    const { data: recipients, error } = await query;
    if (error) throw error;
    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'ไม่พบผู้รับใน Forward Recipients' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let sent = 0;
    const failures: string[] = [];
    for (const r of recipients) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ to: r.line_user_id, messages: [{ type: 'text', text: message }] }),
        });
        if (res.ok) sent++;
        else failures.push(`${r.display_name}: ${await res.text()}`);
      } catch (e: any) {
        failures.push(`${r.display_name}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: recipients.length, failures }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('send-payment-info-line error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});