import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN_URL = Deno.env.get('FLOWACCOUNT_TOKEN_URL') || 'https://openapi.flowaccount.com/test/token';
const API_BASE = Deno.env.get('FLOWACCOUNT_API_BASE_URL') || 'https://sandbox-api.flowaccount.com';
const CLIENT_ID = Deno.env.get('FLOWACCOUNT_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('FLOWACCOUNT_CLIENT_SECRET')!;
const ATTACH_PATH = Deno.env.get('FLOWACCOUNT_ATTACHMENT_PATH') || '/attachments';

async function getToken(): Promise<string> {
  const form = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'flowaccount-api',
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Token ${r.status}: ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt);
  if (!json?.access_token) throw new Error(`No access_token: ${txt.slice(0, 200)}`);
  return json.access_token as string;
}

type AttachInput = {
  invoice_id: string;
  document_type: 'expense-note' | 'purchase-tax-invoice' | 'withholding-tax';
  document_id: string;
  bucket: 'receipts' | 'documents';
  path: string;
  label?: string;
};

async function attachOne(admin: any, faToken: string, inp: AttachInput) {
  const { data: fileBlob, error: dlErr } = await admin.storage.from(inp.bucket).download(inp.path);
  if (dlErr || !fileBlob) throw new Error(`storage: ${dlErr?.message || 'no file'}`);

  const filename = inp.path.split('/').pop() || 'attachment';
  const form = new FormData();
  form.append('documentType', inp.document_type);
  form.append('documentId', inp.document_id);
  form.append('file', fileBlob, filename);

  const r = await fetch(`${API_BASE}${ATTACH_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${faToken}` },
    body: form,
  });
  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* raw */ }
  return { ok: r.ok, status: r.status, json, text: txt, filename, label: inp.label };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const items: AttachInput[] = Array.isArray(body?.items) ? body.items : [body];
    if (!items.length || !items[0]?.invoice_id) {
      return new Response(JSON.stringify({ error: 'items[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invoiceId = items[0].invoice_id;
    const faToken = await getToken();

    const results: any[] = [];
    for (const it of items) {
      try {
        const r = await attachOne(admin, faToken, it);
        results.push({
          label: it.label || it.path.split('/').pop(),
          document_type: it.document_type,
          document_id: it.document_id,
          bucket: it.bucket,
          path: it.path,
          ok: r.ok,
          status: r.status,
          fa_id: r.json?.data?.id || r.json?.id || null,
          error: r.ok ? null : (r.text || '').slice(0, 300),
          uploaded_at: new Date().toISOString(),
        });
      } catch (e: any) {
        results.push({
          label: it.label || it.path.split('/').pop(),
          document_type: it.document_type,
          bucket: it.bucket,
          path: it.path,
          ok: false,
          error: String(e?.message || e).slice(0, 300),
          uploaded_at: new Date().toISOString(),
        });
      }
    }

    // Merge into vendor_invoices.flowaccount_attachments
    const { data: existing } = await admin
      .from('vendor_invoices')
      .select('flowaccount_attachments')
      .eq('id', invoiceId)
      .maybeSingle();
    const prev: any[] = Array.isArray(existing?.flowaccount_attachments) ? existing!.flowaccount_attachments : [];
    await admin.from('vendor_invoices').update({
      flowaccount_attachments: [...prev, ...results],
    }).eq('id', invoiceId);

    const anyFail = results.some(r => !r.ok);
    return new Response(JSON.stringify({ success: !anyFail, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[flowaccount-attach-file]', e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});