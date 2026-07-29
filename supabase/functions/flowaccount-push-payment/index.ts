import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  API_BASE, getToken, faPost, today, extractDocId, docUrl,
  buildExpensePayload, attachFileToFA,
  getDefaultBankAccountId,
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

    const errors: string[] = [];
    const results: any = { expense: null, payment: null };
    const updates: any = {};

    const faToken = await getToken();

    // 1) Make sure the expense document exists in FlowAccount
    let expenseId: string | null = inv.flowaccount_expense_id ? String(inv.flowaccount_expense_id) : null;
    if (expenseId) {
      results.expense = { id: expenseId, url: inv.flowaccount_expense_url, skipped: true };
    } else {
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
      if (r.ok) {
        expenseId = extractDocId(r.json);
        if (expenseId) {
          const url = docUrl('expenses', expenseId);
          results.expense = { id: expenseId, url, status: r.status };
          updates.flowaccount_expense_id = expenseId;
          updates.flowaccount_expense_url = url;
          // keep legacy "bill" columns in sync for existing UI links
          updates.flowaccount_bill_id = expenseId;
          updates.flowaccount_bill_url = url;
        } else {
          errors.push(`Expense: no document id in response: ${(r.text || '').slice(0, 200)}`);
        }
      } else {
        errors.push(`Expense ${r.status} @ ${r.url}: ${(r.text || '').slice(0, 300)}`);
      }
    }

    // 2) Record the payment (transfer). WHT is passed as an amount so FlowAccount
    //    generates the legally-correct หัก ณ ที่จ่าย form on its side.
    if (expenseId) {
      const bankAccountId = await getDefaultBankAccountId(faToken);
      const paymentPayload: any = {
        paymentStructureType: 'Transfer',
        documentId: Number(expenseId),
        // 5 = โอนเงิน (ต้องมี bankAccountId) / 1 = เงินสด (fallback ถ้ายังไม่ได้ผูกบัญชีธนาคารใน FlowAccount)
        paymentMethod: bankAccountId ? 5 : 1,
        ...(bankAccountId ? { bankAccountId } : {}),
        paymentDate: (inv.paid_at ? String(inv.paid_at).split('T')[0] : today()),
        collected: Number(net.toFixed(2)),
        withheldPercentage: wht > 0 ? -1 : 0,
        withheldAmount: wht > 0 ? Number(wht.toFixed(2)) : 0,
        paymentRemarks: inv.invoice_number ? `อ้างอิงบิล ${inv.invoice_number}` : '',
      };
      const p = await faPost(`/expenses/${expenseId}/payment`, faToken, paymentPayload);
      if (p.ok) {
        results.payment = { ok: true, status: p.status, bankAccountId, paymentMethod: bankAccountId ? 5 : 1 };
      } else {
        errors.push(`Payment ${p.status} @ ${p.url}: ${(p.text || '').slice(0, 300)}${bankAccountId ? '' : ' (ไม่พบบัญชีธนาคารใน FlowAccount)'}`);
        results.payment = { ok: false, status: p.status };
      }
    }

    // 3) Attach bill file + transfer slip to the expense document
    const attachResults: any[] = [];
    if (expenseId) {
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
      if (billFile) attachResults.push(await attachFileToFA(admin, faToken, {
        bucket: 'receipts', path: billFile, kind: 'expenses', documentId: expenseId, label: 'บิล/ใบกำกับภาษี',
      }));
      if (slipFile) attachResults.push(await attachFileToFA(admin, faToken, {
        bucket: 'receipts', path: slipFile, kind: 'expenses', documentId: expenseId, label: 'สลิปโอนเงิน',
      }));
      if (attachResults.length) {
        const prev: any[] = Array.isArray(inv.flowaccount_attachments) ? inv.flowaccount_attachments : [];
        updates.flowaccount_attachments = [...prev, ...attachResults];
      }
    }

    const anyFailed = errors.length > 0;
    updates.flowaccount_push_status = anyFailed ? 'failed' : 'success';
    updates.flowaccount_push_error = anyFailed ? errors.join(' | ') : null;
    updates.flowaccount_pushed_at = new Date().toISOString();

    if (anyFailed) console.error('[flowaccount-push-payment]', errors.join(' | '));

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
