import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN_URL = Deno.env.get('FLOWACCOUNT_TOKEN_URL') || 'https://openapi.flowaccount.com/test/token';
const API_BASE = Deno.env.get('FLOWACCOUNT_API_BASE_URL') || 'https://sandbox-api.flowaccount.com';
const CLIENT_ID = Deno.env.get('FLOWACCOUNT_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('FLOWACCOUNT_CLIENT_SECRET')!;
const ATTACH_PATH = Deno.env.get('FLOWACCOUNT_ATTACHMENT_PATH') || '/attachments';

// Default payer (Mengsin Trading) — from Payer Configuration memory
const PAYER = {
  name: 'บริษัท เม้งซินเทรดดิ้ง จำกัด (สำนักงานใหญ่)',
  taxId: '0745556003673',
  branch: '00000',
  address: '98/11 หมู่ 5 ต.พันท้ายนรสิงห์ อ.เมืองสมุทรสาคร จ.สมุทรสาคร 74000',
  phone: '086-4265636',
};

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
  if (!json?.access_token) throw new Error(`No access_token in response: ${txt.slice(0, 200)}`);
  return json.access_token as string;
}

async function faPost(path: string, token: string, body: unknown) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* raw */ }
  return { ok: r.ok, status: r.status, json, text: txt, url };
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

async function attachFileToFA(admin: any, faToken: string, opts: {
  bucket: 'receipts' | 'documents';
  path: string;
  documentType: string;
  documentId: string;
  label: string;
}) {
  try {
    const { data: blob, error } = await admin.storage.from(opts.bucket).download(opts.path);
    if (error || !blob) throw new Error(error?.message || 'no file');
    const filename = opts.path.split('/').pop() || 'attachment';
    const form = new FormData();
    form.append('documentType', opts.documentType);
    form.append('documentId', opts.documentId);
    form.append('file', blob, filename);
    const r = await fetch(`${API_BASE}${ATTACH_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${faToken}` },
      body: form,
    });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch { /* raw */ }
    return {
      label: opts.label, bucket: opts.bucket, path: opts.path,
      document_type: opts.documentType, document_id: opts.documentId,
      ok: r.ok, status: r.status,
      fa_id: json?.data?.id || json?.id || null,
      error: r.ok ? null : (txt || '').slice(0, 300),
      uploaded_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      label: opts.label, bucket: opts.bucket, path: opts.path,
      document_type: opts.documentType, document_id: opts.documentId,
      ok: false, error: String(e?.message || e).slice(0, 300),
      uploaded_at: new Date().toISOString(),
    };
  }
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
    const invoiceId: string | undefined = body?.invoice_id;
    const invoiceType: string = body?.invoice_type || 'vendor';
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'invoice_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invoiceType !== 'vendor') {
      return new Response(JSON.stringify({ error: 'Only vendor invoices supported in this version' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load invoice + vendor
    const { data: inv, error: invErr } = await admin
      .from('vendor_invoices')
      .select('*, vendor_profiles(company_name, tax_id, address, phone, email, bank_name, bank_account)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invoice not found', details: invErr?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vendor = (inv as any).vendor_profiles || {};
    const gross = Number(inv.amount || 0);
    const vat = Number(inv.vat_amount || 0);
    const wht = Number(inv.wht_amount || 0);
    const net = Number(inv.net_amount || gross - wht);

    const results: any = { bill: null, wht: null };
    let anyFailed = false;
    const errors: string[] = [];

    const faToken = await getToken();

    // 1) Purchase Tax Invoice
    if (!inv.flowaccount_bill_id) {
      const billPayload = {
        contact: {
          name: vendor.company_name || 'Unknown Vendor',
          taxId: vendor.tax_id || '',
          address: vendor.address || '',
          phone: vendor.phone || '',
          email: vendor.email || '',
        },
        documentSerial: inv.invoice_number || `AUTO-${inv.id.slice(0, 8)}`,
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
      const r = await faPost('/purchase-tax-invoices', faToken, billPayload);
      if (r.ok) {
        const id = r.json?.data?.id || r.json?.id || r.json?.documentId || null;
        const url = r.json?.data?.viewUrl || r.json?.viewUrl || (id ? `https://app.flowaccount.com/#/purchase-tax-invoices/${id}` : null);
        results.bill = { id, url, status: r.status };
      } else {
        anyFailed = true;
        errors.push(`Bill ${r.status}: ${(r.text || '').slice(0, 300)}`);
      }
    } else {
      results.bill = { id: inv.flowaccount_bill_id, url: inv.flowaccount_bill_url, skipped: true };
    }

    // NOTE: WHT certificate is intentionally NOT created via API.
    // In FlowAccount, ticking "หัก ณ ที่จ่าย" when recording payment auto-generates
    // the legally-correct WHT form. We only push the purchase tax invoice.

    // Persist
    const updates: any = {
      flowaccount_push_status: anyFailed ? 'failed' : 'success',
      flowaccount_push_error: anyFailed ? errors.join(' | ') : null,
      flowaccount_pushed_at: new Date().toISOString(),
    };
    if (results.bill?.id) {
      updates.flowaccount_bill_id = results.bill.id;
      updates.flowaccount_bill_url = results.bill.url;
    }
    if (results.wht?.id) {
      updates.flowaccount_wht_id = results.wht.id;
      updates.flowaccount_wht_url = results.wht.url;
    }
    // Auto-attach files: bill file → both docs, transfer slip (from matched expense) → both docs
    const attachResults: any[] = [];
    const billFile: string | null = inv.file_url || null;
    let slipFile: string | null = null;
    if (inv.matched_expense_id) {
      const { data: exp } = await admin
        .from('expenses')
        .select('receipt_url')
        .eq('id', inv.matched_expense_id)
        .maybeSingle();
      slipFile = exp?.receipt_url || null;
    }

    const doAttach = async (docType: string, docId: string) => {
      if (billFile) attachResults.push(await attachFileToFA(admin, faToken, {
        bucket: 'documents', path: billFile, documentType: docType, documentId: docId, label: 'บิล/ใบกำกับภาษี',
      }));
      if (slipFile) attachResults.push(await attachFileToFA(admin, faToken, {
        bucket: 'receipts', path: slipFile, documentType: docType, documentId: docId, label: 'สลิปโอนเงิน',
      }));
    };
    if (results.bill?.id) await doAttach('purchase-tax-invoice', String(results.bill.id));

    if (attachResults.length) {
      const prev: any[] = Array.isArray(inv.flowaccount_attachments) ? inv.flowaccount_attachments : [];
      updates.flowaccount_attachments = [...prev, ...attachResults];
    }

    await admin.from('vendor_invoices').update(updates).eq('id', invoiceId);

    return new Response(JSON.stringify({
      success: !anyFailed,
      results,
      attachments: attachResults,
      errors: anyFailed ? errors : undefined,
      apiBase: API_BASE,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[flowaccount-push-payment]', e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});