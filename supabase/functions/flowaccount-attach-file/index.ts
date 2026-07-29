import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getToken, attachFileToFA, type FaDocKind } from '../_shared/flowaccount.ts';

type AttachInput = {
  invoice_id: string;
  // legacy values still accepted from older callers
  document_type: FaDocKind | 'expense-note' | 'purchase-tax-invoice' | 'withholding-tax';
  document_id: string;
  bucket: 'receipts' | 'documents';
  path: string;
  label?: string;
};

const KIND_MAP: Record<string, FaDocKind> = {
  'expenses': 'expenses',
  'expense-note': 'expenses',
  'purchases': 'purchases',
  'purchase-tax-invoice': 'purchases',
  'withholding-taxes': 'withholding-taxes',
  'withholding-tax': 'withholding-taxes',
};

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
      const kind = KIND_MAP[it.document_type] || 'expenses';
      results.push(await attachFileToFA(admin, faToken, {
        bucket: it.bucket,
        path: it.path,
        kind,
        documentId: String(it.document_id),
        label: it.label || it.path.split('/').pop() || 'attachment',
      }));
    }

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
