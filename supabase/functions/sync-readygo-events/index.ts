import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// READ-ONLY toward ReadyGo. This function never writes to the ReadyGo project.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    let owner: string | null = null;
    if (token === serviceKey || token === anonKey) {
      // Scheduled run (pg_cron): owner passed explicitly and must be an admin
      owner = body?.owner || null;
      if (!owner) return json({ error: "owner required for scheduled run" }, 400);
      const svc = createClient(supabaseUrl, serviceKey);
      const { data: isAdmin } = await svc.rpc("has_role", { _user_id: owner, _role: "admin" });
      const { data: isSuper } = await svc.rpc("has_role", { _user_id: owner, _role: "super_admin" });
      if (!isAdmin && !isSuper) return json({ error: "owner must be an admin" }, 403);
    } else {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: claims, error } = await anon.auth.getClaims(token);
      if (error || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      owner = claims.claims.sub as string;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const readygoUrl = Deno.env.get("READYGO_SUPABASE_URL");
    const readygoKey = Deno.env.get("READYGO_SUPABASE_ANON_KEY");
    if (!readygoUrl || !readygoKey) return json({ error: "Ready-go credentials not configured" }, 500);
    const readygo = createClient(readygoUrl, readygoKey);

    const warnings: string[] = [];

    // ---- 1. Events → event_registry -------------------------------------
    const { data: rgEvents, error: rgErr } = await readygo
      .from("events")
      .select("id, title, title_th, event_date, location, short_code, event_status")
      .order("event_date", { ascending: false });
    if (rgErr) throw rgErr;

    const { data: existingRows } = await admin
      .from("event_registry")
      .select("id, readygo_event_id, project_tag, aliases")
      .eq("user_id", owner);

    const byReadygoId = new Map<string, any>();
    const byTag = new Map<string, any>();
    for (const r of existingRows || []) {
      if (r.readygo_event_id) byReadygoId.set(r.readygo_event_id, r);
      if (r.project_tag) byTag.set(r.project_tag, r);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const ev of rgEvents || []) {
      const code = (ev.short_code || "").trim();
      if (!code) {
        skipped++;
        warnings.push(`ข้าม: "${ev.title_th || ev.title || ev.id}" ไม่มี short_code`);
        continue;
      }
      const payload = {
        user_id: owner,
        project_tag: `EVT-${code.toUpperCase()}`,
        event_name: (ev.title_th || ev.title || code) as string,
        event_date: ev.event_date || null,
        readygo_event_id: ev.id,
        is_active: ev.event_status === "active",
      };

      const existing = byReadygoId.get(ev.id) || byTag.get(payload.project_tag);
      if (existing) {
        const { error } = await admin
          .from("event_registry")
          .update(payload)
          .eq("id", existing.id);
        if (error) warnings.push(`อัปเดตไม่สำเร็จ ${payload.project_tag}: ${error.message}`);
        else updated++;
      } else {
        const { error } = await admin
          .from("event_registry")
          .insert({ ...payload, aliases: [] });
        if (error) warnings.push(`เพิ่มไม่สำเร็จ ${payload.project_tag}: ${error.message}`);
        else inserted++;
      }
    }

    // ---- 2. festival_events → event_groups -------------------------------
    let groupsInserted = 0;
    let groupsUpdated = 0;
    try {
      const { data: fe, error: feErr } = await readygo
        .from("festival_events")
        .select("festival_id, event_id, day_number");
      if (feErr) throw feErr;

      // Optional festival titles (table may not be readable)
      const festivalTitles = new Map<string, { name: string | null }>();
      const { data: fests } = await readygo
        .from("festivals")
        .select("id, title, title_th");
      for (const f of fests || []) {
        festivalTitles.set(f.id, { name: (f as any).title_th || (f as any).title || null });
      }

      const eventById = new Map((rgEvents || []).map((e: any) => [e.id, e]));
      const grouped = new Map<string, Array<{ event_id: string; day: number }>>();
      for (const row of fe || []) {
        if (!row.festival_id || !row.event_id) continue;
        const list = grouped.get(row.festival_id) || [];
        list.push({ event_id: row.event_id, day: Number(row.day_number ?? 0) });
        grouped.set(row.festival_id, list);
      }

      const { data: existingGroups } = await admin
        .from("event_groups")
        .select("id, project_tag")
        .eq("user_id", owner);
      const groupByTag = new Map((existingGroups || []).map((g: any) => [g.project_tag, g]));

      for (const [festivalId, rows] of grouped) {
        rows.sort((a, b) => a.day - b.day);
        const firstEvent: any = eventById.get(rows[0].event_id);
        const code = (firstEvent?.short_code || "").trim();
        if (!code) {
          warnings.push(`ข้ามเทศกาล ${festivalId}: งานวันแรกไม่มี short_code`);
          continue;
        }
        const dates = rows
          .map((r) => (eventById.get(r.event_id) as any)?.event_date)
          .filter(Boolean)
          .sort();
        const payload = {
          user_id: owner,
          group_name:
            festivalTitles.get(festivalId)?.name ||
            `เทศกาล ${firstEvent?.title_th || firstEvent?.title || code}`,
          project_tag: `FEST-${code.toUpperCase()}`,
          festival_date: dates[0] || null,
          readygo_event_ids: rows.map((r) => r.event_id),
        };
        const existing = groupByTag.get(payload.project_tag);
        if (existing) {
          const { error } = await admin.from("event_groups").update(payload).eq("id", existing.id);
          if (!error) groupsUpdated++;
        } else {
          const { error } = await admin.from("event_groups").insert(payload);
          if (!error) groupsInserted++;
        }
      }
    } catch (e) {
      warnings.push(`เทศกาล: ${e instanceof Error ? e.message : "อ่านข้อมูลไม่ได้"}`);
    }

    return json({
      success: true,
      events: { total: (rgEvents || []).length, inserted, updated, skipped },
      festivals: { inserted: groupsInserted, updated: groupsUpdated },
      warnings,
    });
  } catch (error) {
    console.error("sync-readygo-events error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
