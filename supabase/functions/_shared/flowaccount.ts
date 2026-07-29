// Shared FlowAccount OpenAPI v1 helpers
// Docs: https://openapi.flowaccount.com  (sandbox: /test/v1, production: /v1)

const CLIENT_ID = Deno.env.get('FLOWACCOUNT_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('FLOWACCOUNT_CLIENT_SECRET')!;
export const TOKEN_URL = Deno.env.get('FLOWACCOUNT_TOKEN_URL') || 'https://openapi.flowaccount.com/test/token';

function resolveApiBase(): string {
  const raw = (Deno.env.get('FLOWACCOUNT_API_BASE_URL') || '').trim().replace(/\/+$/, '');
  // Only accept an explicit base if it points at the documented OpenAPI host
  if (raw && /openapi\.flowaccount\.com/.test(raw)) {
    return /\/v1$/.test(raw) ? raw : `${raw}/v1`;
  }
  // Derive from the token URL: /test/token => sandbox, /token => production
  return TOKEN_URL.includes('/test/') 
    ? 'https://openapi.flowaccount.com/test/v1'
    : 'https://openapi.flowaccount.com/v1';
}

export const API_BASE = resolveApiBase();
export const IS_SANDBOX = API_BASE.includes('/test/');

export async function getToken(): Promise<string> {
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

export async function faRequest(method: 'GET' | 'POST' | 'PUT', path: string, token: string, body?: unknown) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* raw (usually an HTML error page) */ }
  return { ok: r.ok, status: r.status, json, text: txt, url };
}

export const faPost = (path: string, token: string, body: unknown) => faRequest('POST', path, token, body);
export const faGet = (path: string, token: string) => faRequest('GET', path, token);

export const today = () => new Date().toISOString().split('T')[0];

/** Extract the record/document id from a FlowAccount SimpleDocument response */
export function extractDocId(json: any): string | null {
  const d = json?.data ?? json;
  const id = d?.recordId ?? d?.documentId ?? d?.id ?? null;
  return id == null ? null : String(id);
}

export function docUrl(kind: 'expenses' | 'purchases' | 'withholding-taxes', id: string | null): string | null {
  return id ? `https://flowaccount.com/#/${kind}/${id}` : null;
}

/**
 * Expense line items must carry a FlowAccount expense category.
 * Fetch the business categories and pick a sensible default (env override supported).
 */
let cachedCategory: any = null;
export async function getDefaultExpenseCategory(token: string): Promise<any | null> {
  if (cachedCategory) return cachedCategory;
  const wanted = (Deno.env.get('FLOWACCOUNT_DEFAULT_EXPENSE_CATEGORY') || '').trim();
  const r = await faGet('/expenses/categories/business', token);
  if (!r.ok) {
    console.error('[flowaccount] categories fetch failed', r.status, (r.text || '').slice(0, 200));
    return null;
  }
  const list: any[] = r.json?.data ?? r.json ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const byName = (c: any) => `${c.nameLocal || ''} ${c.nameForeign || ''}`;
  cachedCategory =
    (wanted && list.find((c) => byName(c).includes(wanted) || String(c.categoryId) === wanted)) ||
    list.find((c) => byName(c).includes('อื่น')) ||
    list[0];
  return cachedCategory;
}

/** Build an /expenses SimpleDocument payload */
export async function buildExpensePayload(token: string, opts: {
  contactName: string;
  contactTaxId?: string;
  contactAddress?: string;
  contactEmail?: string;
  contactNumber?: string;
  documentSerial?: string | null;
  publishedOn: string;
  dueDate?: string | null;
  description: string;
  gross: number;
  vat: number;
  reference?: string | null;
  remarks?: string | null;
}) {
  const category = await getDefaultExpenseCategory(token);
  const isVat = opts.vat > 0;
  // FlowAccount expects amounts excluding VAT when isVatInclusive = false
  const subTotal = Number((opts.gross - opts.vat).toFixed(2));

  const item: any = {
    ...(category || {}),
    description: opts.description || 'ค่าใช้จ่าย',
    quantity: 1,
    unitName: '',
    pricePerUnit: subTotal,
    total: subTotal,
  };

  return {
    contactName: opts.contactName,
    contactTaxId: opts.contactTaxId || '',
    contactAddress: opts.contactAddress || '',
    contactEmail: opts.contactEmail || '',
    contactNumber: opts.contactNumber || '',
    contactGroup: opts.contactTaxId && opts.contactTaxId.length === 13 ? 3 : 1,
    ...(opts.documentSerial ? { documentSerial: opts.documentSerial } : {}),
    publishedOn: opts.publishedOn,
    creditType: opts.dueDate ? 1 : 3,
    ...(opts.dueDate ? { dueDate: opts.dueDate } : {}),
    reference: opts.reference || '',
    isVatInclusive: false,
    items: [item],
    subTotal,
    discountPercentage: 0,
    discountAmount: 0,
    totalAfterDiscount: subTotal,
    isVat,
    vatAmount: Number(opts.vat.toFixed(2)),
    grandTotal: Number(opts.gross.toFixed(2)),
    remarks: opts.remarks || '',
  };
}

/** Download a file from storage, trying the given bucket first then the other one. */
async function downloadFile(admin: any, bucket: string, path: string) {
  const buckets = bucket === 'receipts' ? ['receipts', 'documents'] : ['documents', 'receipts'];
  for (const b of buckets) {
    const { data, error } = await admin.storage.from(b).download(path);
    if (!error && data) return { blob: data, bucket: b };
  }
  return null;
}

export type FaDocKind = 'expenses' | 'purchases' | 'withholding-taxes';

/** Attach a stored file to a FlowAccount document: POST /{kind}/{id}/attachment */
export async function attachFileToFA(admin: any, faToken: string, opts: {
  bucket: 'receipts' | 'documents';
  path: string;
  kind: FaDocKind;
  documentId: string;
  label: string;
}) {
  const base = {
    label: opts.label,
    bucket: opts.bucket,
    path: opts.path,
    document_type: opts.kind,
    document_id: opts.documentId,
    uploaded_at: new Date().toISOString(),
  };
  try {
    const dl = await downloadFile(admin, opts.bucket, opts.path);
    if (!dl) throw new Error('file not found in storage');
    const filename = opts.path.split('/').pop() || 'attachment';
    const form = new FormData();
    form.append('file', dl.blob, filename);
    const r = await fetch(`${API_BASE}/${opts.kind}/${opts.documentId}/attachment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${faToken}` },
      body: form,
    });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch { /* raw */ }
    if (!r.ok) console.error('[flowaccount] attach failed', r.status, txt.slice(0, 300));
    return {
      ...base,
      bucket: dl.bucket,
      ok: r.ok,
      status: r.status,
      fa_id: json?.data?.attachmentId ?? json?.data?.id ?? null,
      error: r.ok ? null : (txt || '').slice(0, 300),
    };
  } catch (e: any) {
    return { ...base, ok: false, error: String(e?.message || e).slice(0, 300) };
  }
}
