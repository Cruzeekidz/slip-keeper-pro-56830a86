import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  API_BASE, getToken, faPost, today, extractDocId, docUrl,
  buildExpensePayload, attachFileToFA,
} from '../_shared/flowaccount.ts';

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
    const invoiceId: string | undefined = body?.invoice_id;
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'invoice_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: inv, error: invErr } = await admin
      .from('vendor_invoices')
      .select('*, vendor_profiles(company_name, tax_id, address, phone, email)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invoice not found', details: invErr?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (inv.flowaccount_expense_id) {
      return new Response(JSON.stringify({
        success: true, skipped: true,
        id: inv.flowaccount_expense_id, url: inv.flowaccount_expense_url,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const vendor = (inv as any).vendor_profiles || {};
    const gross = Number(inv.amount || 0);
    const vat = Number(inv.vat_amount || 0);

    const faToken = await getToken();

    const payload = await buildExpensePayload(faToken, {
      contactName: vendor.company_name || 'Unknown Vendor',
      contactTaxId: vendor.tax_id || '',
      contactAddress: vendor.address || '',
      contactEmail: vendor.email || '',
      contactNumber: vendor.phone || '',
      documentSerial: inv.invoice_number || null,
      publishedOn: inv.invoice_date || today(),
      dueDate: inv.due_date || null,
      description: inv.description || 'ค่าใช้จ่าย',
      gross,
      vat,
      reference: inv.invoice_number || null,
      remarks: inv.notes || null,
    });

    const r = await faPost('/expenses', faToken, payload);

    if (!r.ok) {
      const errMsg = `Expense ${r.status} @ ${r.url}: ${(r.text || '').slice(0, 300)}`;
      console.error('[flowaccount-push-expense-note]', errMsg);
      await admin.from('vendor_invoices').update({
        flowaccount_push_status: 'failed',
        flowaccount_push_error: errMsg,
      }).eq('id', invoiceId);
      return new Response(JSON.stringify({ success: false, error: errMsg, apiBase: API_BASE }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const id = extractDocId(r.json);
    if (!id) {
      const errMsg = `No document id in FA response: ${(r.text || '').slice(0, 300)}`;
      console.error('[flowaccount-push-expense-note]', errMsg);
      await admin.from('vendor_invoices').update({
        flowaccount_push_status: 'failed',
        flowaccount_push_error: errMsg,
      }).eq('id', invoiceId);
      return new Response(JSON.stringify({ success: false, error: errMsg, apiBase: API_BASE }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = docUrl('expenses', id);

    await admin.from('vendor_invoices').update({
      flowaccount_expense_id: id,
      flowaccount_expense_url: url,
      flowaccount_push_status: 'success',
      flowaccount_push_error: null,
      flowaccount_pushed_at: new Date().toISOString(),
    }).eq('id', invoiceId);

    // Auto-attach vendor bill file to the expense document
    const attachResults: any[] = [];
    if (inv.file_url) {
      attachResults.push(await attachFileToFA(admin, faToken, {
        bucket: 'receipts', path: inv.file_url,
        kind: 'expenses', documentId: id,
        label: 'บิล/ใบวางบิล',
      }));
      const prev: any[] = Array.isArray(inv.flowaccount_attachments) ? inv.flowaccount_attachments : [];
      await admin.from('vendor_invoices').update({
        flowaccount_attachments: [...prev, ...attachResults],
      }).eq('id', invoiceId);
    }

    return new Response(JSON.stringify({ success: true, id, url, attachments: attachResults, apiBase: API_BASE }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[flowaccount-push-expense-note]', e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
