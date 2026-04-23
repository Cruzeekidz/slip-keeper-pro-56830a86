import { supabase } from "@/integrations/supabase/client";

export interface ExpenseCandidate {
  id: string;
  expense_date: string;
  amount: number;
  receiver: string | null;
  receiver_account_name: string | null;
  receipt_url: string | null;
  description: string | null;
  category: string | null;
  staff_name: string | null;
  match_score: number;
  match_reason: string;
}

export interface InvoiceForMatching {
  id: string;
  invoice_number: string;
  net_amount: number;
  paid_at?: string | null;
  staff_profiles?: {
    staff_name?: string;
    nickname?: string | null;
    bank_account?: string | null;
  } | null;
}

/**
 * หา expense ที่น่าจะเป็นการจ่ายของ invoice นี้
 * เกณฑ์: Net Amount ตรงเป๊ะ + ชื่อทีมงาน (หรือชื่อเล่น) ปรากฏในผู้รับ + ช่วงวัน ±3 วันจากวันที่ที่ตั้ง (หรือทุกวันถ้าไม่มี)
 */
export async function findMatchingExpenses(
  invoice: InvoiceForMatching,
  userId: string,
  options?: { dateRange?: number; centerDate?: string }
): Promise<ExpenseCandidate[]> {
  const net = Number(invoice.net_amount);
  if (!net || net <= 0) return [];

  const staffName = invoice.staff_profiles?.staff_name?.trim() || "";
  const nickname = invoice.staff_profiles?.nickname?.trim() || "";

  // Range: ±7 days from centerDate (paid_at or today)
  const range = options?.dateRange ?? 7;
  const center = options?.centerDate
    ? new Date(options.centerDate)
    : invoice.paid_at
      ? new Date(invoice.paid_at)
      : new Date();
  const from = new Date(center);
  from.setDate(from.getDate() - range);
  const to = new Date(center);
  to.setDate(to.getDate() + range);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];

  // Exact net amount match (±0.01 for floating point)
  const { data, error } = await supabase
    .from("expenses")
    .select("id, expense_date, amount, receiver, receiver_account_name, receipt_url, description, category, staff_name")
    .eq("user_id", userId)
    .eq("transaction_direction", "EXPENSE")
    .gte("amount", net - 0.01)
    .lte("amount", net + 0.01)
    .gte("expense_date", fromStr)
    .lte("expense_date", toStr)
    .order("expense_date", { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const norm = (s: string | null | undefined) =>
    (s || "").toLowerCase().replace(/\s+/g, "").replace(/[^\u0E00-\u0E7Fa-z0-9]/g, "");

  const sNorm = norm(staffName);
  const nNorm = norm(nickname);

  // Filter: name must appear in receiver or staff_name or description
  const candidates: ExpenseCandidate[] = [];
  for (const e of data) {
    const haystack = norm(`${e.receiver || ""} ${e.receiver_account_name || ""} ${e.staff_name || ""} ${e.description || ""}`);
    let nameMatch = false;
    let reasonParts: string[] = ["ยอดตรง"];
    if (sNorm && haystack.includes(sNorm)) {
      nameMatch = true;
      reasonParts.push("ชื่อตรง");
    } else if (nNorm && nNorm.length >= 2 && haystack.includes(nNorm)) {
      nameMatch = true;
      reasonParts.push("ชื่อเล่นตรง");
    }
    if (!nameMatch) continue;

    candidates.push({
      ...e,
      match_score: 100,
      match_reason: reasonParts.join(" + "),
    } as ExpenseCandidate);
  }

  return candidates;
}

/**
 * เชื่อม invoice กับ expense ที่จ่ายแล้ว — ตั้ง status='paid', matched_expense_id, ดึง slip + paid_at จาก expense
 * คืน expense data เพื่อใช้เขียน audit log
 */
export async function linkInvoiceToExpense(params: {
  invoiceId: string;
  expenseId: string;
  userId: string;
  userEmail?: string | null;
  invoiceNumber?: string | null;
  oldStatus?: string | null;
}): Promise<void> {
  const { invoiceId, expenseId, userId, userEmail, invoiceNumber, oldStatus } = params;

  // Fetch expense to get slip path & date
  const { data: exp, error: expErr } = await supabase
    .from("expenses")
    .select("receipt_url, expense_date, amount")
    .eq("id", expenseId)
    .single();
  if (expErr) throw expErr;

  const updates: Record<string, unknown> = {
    status: "paid",
    matched_expense_id: expenseId,
    paid_at: exp.expense_date ? new Date(exp.expense_date).toISOString() : new Date().toISOString(),
  };
  if (exp.receipt_url) updates.payment_slip_url = exp.receipt_url;

  const { error } = await supabase
    .from("staff_invoices")
    .update(updates)
    .eq("id", invoiceId);
  if (error) throw error;

  // Audit log
  await supabase.from("staff_invoice_audit_log").insert({
    invoice_id: invoiceId,
    invoice_number: invoiceNumber || null,
    action: "link_expense",
    old_status: oldStatus || null,
    new_status: "paid",
    changed_by: userId,
    changed_by_email: userEmail || null,
    new_data: { matched_expense_id: expenseId, linked_amount: Number(exp.amount) },
  });
}
