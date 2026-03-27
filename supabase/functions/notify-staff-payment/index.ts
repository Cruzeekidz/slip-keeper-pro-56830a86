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
    const { staff_id, amount, payment_slip_path, payment_method } = await req.json();

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
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no LINE ID' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages: Array<{type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string}> = [];

    // If there's a slip image, forward it
    if (payment_slip_path) {
      const { data: signedData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(payment_slip_path, 86400);
      const slipImageUrl = signedData?.signedUrl || null;
      if (slipImageUrl) {
        messages.push({
          type: "image",
          originalContentUrl: slipImageUrl,
          previewImageUrl: slipImageUrl,
        });
      }
    }

    // Thank-you message
    const amountText = amount ? ` 💰 ${Number(amount).toLocaleString()} บาท` : '';
    const methodText = payment_method === 'cash' ? ' (เงินสด)' : payment_method === 'credit' ? ' (เครดิต)' : '';
    messages.push({
      type: "text",
      text: `โอนเงินเรียบร้อย${amountText}${methodText}\nขอบคุณที่มาช่วยกันจัดงานดีๆให้เด็กๆนะคะ 🙏❤️`,
    });

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
