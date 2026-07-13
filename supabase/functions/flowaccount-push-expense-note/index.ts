import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN_URL = Deno.env.get('FLOWACCOUNT_TOKEN_URL') || 'https://openapi.flowaccount.com/test/token';
const API_BASE = Deno.env.get('FLOWACCOUNT_API_BASE_URL') || 'https://sandbox-api.flowaccount.com';
const CLIENT_ID = Deno.env.get('FLOWACCOUNT_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('FLOWACCOUNT_CLIENT_SECRET')!;

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

async function faPost(path: string, token: string, body: unknown) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* raw */ }
  return { ok: r.ok, status: r.status, json, text: txt };
}

const today = () => new Date().toISOString().split('T')[0];

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
        success: true,
        skipped: true,
        id: inv.flowaccount_expense_id,
        url: inv.flowaccount_expense_url,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const vendor = (inv as any).vendor_profiles || {};
    const gross = Number(inv.amount || 0);
    const vat = Number(inv.vat_amount || 0);

    const faToken = await getToken();

    const payload = {
      contact: {
        name: vendor.company_name || 'Unknown Vendor',
        taxId: vendor.tax_id || '',
        address: vendor.address || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
      },
      documentSerial: inv.invoice_number || `EXP-${inv.id.slice(0, 8)}`,
      documentDate: inv.invoice_date || today(),
      dueDate: inv.due_date || inv.invoice_date || today(),
      items: [{
        name: inv.description || 'ค่าใช้จ่าย',
        description: inv.description || '',
        quantity: 1,
        unitPrice: gross - vat,
        total: gross - vat,
        taxRate: vat > 0 ? 7 : 0,
      }],
      vatType: vat > 0 ? 'ExcludeVat' : 'NoVat',
      subTotal: gross - vat,
      vatAmount: vat,
      grandTotal: gross,
      status: 'approved',
    };

    const r = await faPost('/expense-notes', faToken, payload);

    if (!r.ok) {
      const errMsg = `Expense ${r.status}: ${(r.text || '').slice(0, 300)}`;
      await admin.from('vendor_invoices').update({
        flowaccount_push_error: errMsg,
      }).eq('id', invoiceId);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const id = r.json?.data?.id || r.json?.id || r.json?.documentId || null;
    const url = r.json?.data?.viewUrl || r.json?.viewUrl || (id ? `https://app.flowaccount.com/#/expense-notes/${id}` : null);

    await admin.from('vendor_invoices').update({
      flowaccount_expense_id: id,
      flowaccount_expense_url: url,
      flowaccount_pushed_at: new Date().toISOString(),
    }).eq('id', invoiceId);

    return new Response(JSON.stringify({ success: true, id, url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[flowaccount-push-expense-note]', e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});