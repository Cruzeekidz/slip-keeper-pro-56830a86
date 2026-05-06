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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lineUserId: string | undefined = body.line_user_id || body.lineUserId;
    const message: string | undefined = body.message;
    const imageUrl: string | undefined = body.image_url || body.imageUrl;

    if (!lineUserId || typeof lineUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'line_user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((!message || typeof message !== 'string' || !message.trim()) && !imageUrl) {
      return new Response(JSON.stringify({ error: 'message or image_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages: any[] = [];
    if (message && message.trim()) {
      messages.push({ type: 'text', text: message.slice(0, 4900) });
    }
    if (imageUrl) {
      messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
    }

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('LINE push failed:', res.status, text);
      return new Response(JSON.stringify({ error: `LINE API ${res.status}: ${text}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('send-line-message error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});