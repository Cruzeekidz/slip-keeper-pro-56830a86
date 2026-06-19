import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TOKEN_URL = Deno.env.get('FLOWACCOUNT_TOKEN_URL') || 'https://openapi.flowaccount.com/test/token';
const API_BASE = Deno.env.get('FLOWACCOUNT_API_BASE_URL') || 'https://sandbox-api.flowaccount.com';
const CLIENT_ID = Deno.env.get('FLOWACCOUNT_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('FLOWACCOUNT_CLIENT_SECRET');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return new Response(JSON.stringify({ success: false, error: 'Missing FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const t0 = Date.now();
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'flowaccount-api',
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const tokenText = await tokenRes.text();
    let tokenJson: any = null;
    try { tokenJson = JSON.parse(tokenText); } catch { /* keep raw */ }
    const latencyMs = Date.now() - t0;

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        stage: 'token',
        status: tokenRes.status,
        latencyMs,
        tokenUrl: TOKEN_URL,
        response: tokenJson ?? tokenText,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken: string | undefined = tokenJson?.access_token;
    const tokenPreview = accessToken ? `${accessToken.slice(0, 12)}…${accessToken.slice(-6)}` : null;

    return new Response(JSON.stringify({
      success: true,
      stage: 'token',
      status: tokenRes.status,
      latencyMs,
      tokenUrl: TOKEN_URL,
      apiBase: API_BASE,
      token: {
        type: tokenJson?.token_type,
        expires_in: tokenJson?.expires_in,
        scope: tokenJson?.scope,
        preview: tokenPreview,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});