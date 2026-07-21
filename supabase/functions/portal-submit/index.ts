// Portal submission endpoint. Verifies a LIFF (LINE) access token before
// performing any writes on behalf of an "owner" (Lovable admin user id).
// Replaces the previous anonymous INSERT policies on public tables.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LINE_CHANNEL_ID = "2008893199"; // matches VITE_LIFF_ID prefix (LIFF channel)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface VerifiedLine {
  userId: string;
  displayName: string;
}

async function verifyLineAccessToken(token: string): Promise<VerifiedLine | null> {
  try {
    const verify = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`,
    );
    if (!verify.ok) return null;
    const info = await verify.json();
    if (info.client_id !== LINE_CHANNEL_ID) return null;
    if (typeof info.expires_in === "number" && info.expires_in <= 0) return null;

    const profile = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profile.ok) return null;
    const p = await profile.json();
    if (!p.userId) return null;
    return { userId: p.userId, displayName: p.displayName ?? "" };
  } catch (_err) {
    return null;
  }
}

async function isValidOwner(owner: string): Promise<boolean> {
  if (!UUID_RE.test(owner)) return false;
  const { data, error } = await admin.rpc("is_valid_user_id", { p_user_id: owner });
  if (error) return false;
  return !!data;
}

// Decode a base64 data-URL or raw base64 payload into bytes.
function decodeBase64(b64: string): Uint8Array {
  const commaIdx = b64.indexOf(",");
  const raw = commaIdx >= 0 ? b64.slice(commaIdx + 1) : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface FilePayload {
  name: string;
  mime: string;
  data_b64: string; // base64 (may include data-url prefix)
}

async function uploadFile(
  bucket: string,
  path: string,
  file: FilePayload,
): Promise<{ path: string } | { error: string }> {
  const bytes = decodeBase64(file.data_b64);
  if (bytes.byteLength > 8 * 1024 * 1024) return { error: "file_too_large" };
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, bytes, { contentType: file.mime || "application/octet-stream", upsert: false });
  if (error) return { error: error.message };
  return { path };
}

async function notifyAdmin(body: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("notify-admin-event failed", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { action, owner, lineAccessToken, payload, file } = body ?? {};
  if (typeof action !== "string") return json({ error: "missing_action" }, 400);
  if (typeof owner !== "string" || !UUID_RE.test(owner)) {
    return json({ error: "invalid_owner" }, 400);
  }
  if (typeof lineAccessToken !== "string" || lineAccessToken.length < 20) {
    return json({ error: "line_login_required" }, 401);
  }

  const verified = await verifyLineAccessToken(lineAccessToken);
  if (!verified) return json({ error: "invalid_line_token" }, 401);

  if (!(await isValidOwner(owner))) return json({ error: "invalid_owner" }, 400);

  try {
    switch (action) {
      case "list_events": {
        const since = new Date();
        since.setMonth(since.getMonth() - 3);
        const cutoff = since.toISOString().split("T")[0];
        const { data, error } = await admin.rpc("portal_list_active_events", {
          p_owner: owner,
          p_since: cutoff,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ events: data ?? [] });
      }

      case "lookup_staff_by_phone": {
        const phone = String(payload?.phone ?? "").replace(/[^0-9]/g, "");
        if (phone.length < 4) return json({ error: "invalid_phone" }, 400);
        const { data, error } = await admin
          .from("staff_profiles")
          .select("id, staff_name, daily_rate, user_id, line_user_id")
          .eq("user_id", owner)
          .eq("is_active", true)
          .ilike("phone", `%${phone.slice(-4)}%`);
        if (error) return json({ error: error.message }, 500);
        // Do not leak PII beyond what the invoice form needs.
        const trimmed = (data ?? []).map((s: any) => ({
          id: s.id,
          staff_name: s.staff_name,
          daily_rate: s.daily_rate,
          user_id: s.user_id,
          linked: s.line_user_id === verified.userId,
        }));
        return json({ staff: trimmed });
      }

      case "lookup_staff_by_id": {
        const staffId = String(payload?.staff_id ?? "");
        if (!UUID_RE.test(staffId)) return json({ error: "invalid_staff_id" }, 400);
        const { data, error } = await admin
          .from("staff_profiles")
          .select("id, staff_name, daily_rate, user_id")
          .eq("id", staffId)
          .eq("user_id", owner)
          .eq("is_active", true)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "not_found" }, 404);
        return json({ staff: data });
      }

      case "register_staff": {
        const p = payload ?? {};
        if (!p.staff_name || !p.phone) return json({ error: "missing_fields" }, 400);
        let idCardUrl: string | null = null;
        if (file?.data_b64) {
          const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
          const path = `id-cards/${owner}/${Date.now()}-${verified.userId}.${ext}`;
          const up = await uploadFile("documents", path, file);
          if ("error" in up) return json({ error: `upload_failed:${up.error}` }, 500);
          idCardUrl = up.path;
        }
        const { data, error } = await admin.from("staff_profiles").insert({
          user_id: owner,
          staff_name: p.staff_name,
          nickname: p.nickname || null,
          position: p.position || null,
          phone: p.phone || null,
          email: p.email || null,
          tax_id: p.tax_id || null,
          bank_name: p.bank_name || null,
          bank_account: p.bank_account || null,
          address: p.address || null,
          daily_rate: Number(p.daily_rate) || 0,
          id_card_url: idCardUrl,
          line_user_id: verified.userId,
        }).select("id, staff_name").single();
        if (error) return json({ error: error.message }, 500);
        await notifyAdmin({
          owner_user_id: owner,
          event_type: "new_registration",
          actor_kind: "staff",
          actor_name: p.staff_name,
        });
        return json({ ok: true, staff: data });
      }

      case "register_vendor": {
        const p = payload ?? {};
        if (!p.company_name || !p.phone) return json({ error: "missing_fields" }, 400);
        let taxDocUrl: string | null = null;
        if (file?.data_b64) {
          const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
          const path = `tax-docs/${owner}/${Date.now()}-${verified.userId}.${ext}`;
          const up = await uploadFile("documents", path, file);
          if ("error" in up) return json({ error: `upload_failed:${up.error}` }, 500);
          taxDocUrl = up.path;
        }
        const { data, error } = await admin.from("vendor_profiles").insert({
          user_id: owner,
          vendor_type: p.vendor_type || "company",
          company_name: p.company_name,
          tax_id: p.tax_id || null,
          contact_name: p.contact_name || null,
          phone: p.phone || null,
          email: p.email || null,
          address: p.address || null,
          bank_name: p.bank_name || null,
          bank_account: p.bank_account || null,
          tax_doc_url: taxDocUrl,
          line_user_id: verified.userId,
        }).select("id, company_name").single();
        if (error) return json({ error: error.message }, 500);
        await notifyAdmin({
          owner_user_id: owner,
          event_type: "new_registration",
          actor_kind: "vendor",
          actor_name: p.company_name,
        });
        return json({ ok: true, vendor: data });
      }

      case "submit_staff_invoice": {
        const p = payload ?? {};
        const staffId = String(p.staff_id ?? "");
        if (!UUID_RE.test(staffId)) return json({ error: "invalid_staff_id" }, 400);
        // Confirm staff belongs to owner AND matches verified LINE user.
        const { data: staff, error: sErr } = await admin
          .from("staff_profiles")
          .select("id, staff_name, user_id, line_user_id")
          .eq("id", staffId)
          .eq("user_id", owner)
          .maybeSingle();
        if (sErr) return json({ error: sErr.message }, 500);
        if (!staff) return json({ error: "staff_not_found" }, 404);
        if (staff.line_user_id && staff.line_user_id !== verified.userId) {
          return json({ error: "line_user_mismatch" }, 403);
        }
        // If not yet linked, opportunistically link (owner + LINE both verified now).
        if (!staff.line_user_id) {
          await admin.from("staff_profiles")
            .update({ line_user_id: verified.userId })
            .eq("id", staff.id);
        }

        const invoiceNumber = p.invoice_number ||
          `SI-${new Date().getFullYear() + 543}-${String(Date.now()).slice(-4)}`;

        const { data: inv, error: iErr } = await admin.from("staff_invoices").insert({
          user_id: owner,
          staff_id: staff.id,
          invoice_number: invoiceNumber,
          event_id: p.event_id || null,
          event_name: p.event_name || null,
          days_worked: p.days_worked,
          daily_rate: p.daily_rate,
          gross_amount: p.gross_amount,
          wht_rate: p.wht_rate,
          wht_amount: p.wht_amount,
          net_amount: p.net_amount,
          work_start_date: p.work_start_date || null,
          work_end_date: p.work_end_date || null,
          notes: p.notes || null,
          status: "submitted",
          submitted_via: "web",
          submitted_at: new Date().toISOString(),
        }).select("id").single();
        if (iErr) return json({ error: iErr.message }, 500);

        if (Array.isArray(p.expense_claims) && p.expense_claims.length > 0) {
          const claims = p.expense_claims.map((c: any) => ({
            user_id: owner,
            staff_id: staff.id,
            invoice_id: inv.id,
            event_id: p.event_id || null,
            event_name: p.event_name || null,
            category: c.category,
            description: c.description,
            amount: c.amount,
            receipt_url: c.receipt_url || null,
            has_formal_receipt: !!c.has_formal_receipt,
            expense_date: c.expense_date || null,
            status: "submitted",
          }));
          const { error: cErr } = await admin.from("staff_expense_claims").insert(claims);
          if (cErr) console.error("claims insert error", cErr);
        }

        // Auto-create typed event if user typed one
        if (!p.event_id && p.event_name) {
          const trimmed = String(p.event_name).trim();
          if (trimmed) {
            const { data: exists } = await admin.from("event_registry")
              .select("id").eq("user_id", owner).ilike("event_name", trimmed).maybeSingle();
            if (!exists) {
              await admin.from("event_registry").insert({
                user_id: owner,
                event_name: trimmed,
                project_tag: `EVT-MANUAL-${Date.now().toString().slice(-8)}`,
                event_date: p.work_start_date || null,
                is_active: true,
              });
            }
          }
        }

        await notifyAdmin({
          owner_user_id: owner,
          event_type: "staff_claim_new",
          actor_kind: "staff",
          actor_name: staff.staff_name,
          amount: p.net_amount,
          invoice_number: invoiceNumber,
          description: p.event_name || p.notes || "ใบเรียกเก็บเงินทีมงาน",
        });
        return json({ ok: true, invoice_id: inv.id, invoice_number: invoiceNumber });
      }

      case "submit_vendor_bill": {
        const p = payload ?? {};
        if (!file?.data_b64) return json({ error: "bill_file_required" }, 400);
        const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
        const path = `vendor-bills/${owner}/${Date.now()}-${verified.userId}.${ext}`;
        const up = await uploadFile("receipts", path, file);
        if ("error" in up) return json({ error: `upload_failed:${up.error}` }, 500);

        const desc = p.company_name
          ? `${p.company_name} - ${p.description || ""}`.trim()
          : (p.description || "บิลจากคู่ค้า");

        const { error } = await admin.from("vendor_invoices").insert({
          user_id: owner,
          invoice_number: p.invoice_number || null,
          amount: Number(p.amount) || 0,
          net_amount: Number(p.amount) || 0,
          description: desc,
          file_url: up.path,
          notes: p.notes || null,
          status: "pending",
        });
        if (error) return json({ error: error.message }, 500);

        await notifyAdmin({
          owner_user_id: owner,
          event_type: "vendor_bill_new",
          actor_kind: "vendor",
          actor_name: p.company_name || "คู่ค้า",
          amount: Number(p.amount) || 0,
          invoice_number: p.invoice_number || undefined,
          description: p.description || undefined,
        });
        return json({ ok: true });
      }

      case "quick_link": {
        const p = payload ?? {};
        const kind = p.kind === "vendor" ? "vendor" : "staff";
        const phone = String(p.phone ?? "");
        const taxId = String(p.tax_id ?? "");
        const targetId = p.target_id ? String(p.target_id) : null;
        if (kind === "staff") {
          const { data, error } = await admin.rpc("link_staff_line_id", {
            p_owner: owner,
            p_phone: phone,
            p_line_user_id: verified.userId,
            p_staff_id: targetId,
          });
          if (error) return json({ error: error.message }, 500);
          return json({ result: data });
        } else {
          const { data, error } = await admin.rpc("link_vendor_line_id", {
            p_owner: owner,
            p_phone: phone,
            p_tax_id: taxId,
            p_line_user_id: verified.userId,
            p_vendor_id: targetId,
          });
          if (error) return json({ error: error.message }, 500);
          return json({ result: data });
        }
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error("portal-submit error", err);
    return json({ error: (err as Error).message || "server_error" }, 500);
  }
});