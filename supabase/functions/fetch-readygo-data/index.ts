import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth from this project
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const localSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await localSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body?.action;

    // Connect to Ready-go.fun Supabase
    const readygoUrl = Deno.env.get("READYGO_SUPABASE_URL");
    const readygoKey = Deno.env.get("READYGO_SUPABASE_ANON_KEY");

    if (!readygoUrl || !readygoKey) {
      return new Response(
        JSON.stringify({ error: "Ready-go.fun credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const readygo = createClient(readygoUrl, readygoKey);

    if (action === "list-events") {
      const { data: events, error } = await readygo
        .from("events")
        .select("id, title, short_code, event_date, location")
        .order("event_date", { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ events: events || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "event-financials") {
      const eventId = body?.event_id;

      if (!eventId) {
        return new Response(JSON.stringify({ error: "event_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch event
      const { data: event, error: eventError } = await readygo
        .from("events")
        .select("id, title, short_code, event_date, location")
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;

      // Fetch completed registrations
      const { data: completedRegs } = await readygo
        .from("event_registrations")
        .select("id, registration_fee, multi_day_discount_applied, discount_amount, oto1_booked, oto2_accepted, oto1_amount, oto2_amount, cruzee_discount_amount, payment_status, selected_age_category")
        .eq("event_id", eventId)
        .in("payment_status", ["completed", "sponsored"])
        .is("deleted_at", null);

      // Fetch OTO purchases
      const { data: otoPurchases } = await readygo
        .from("oto_purchases")
        .select("oto_type, price, fulfillment_status")
        .eq("event_id", eventId);

      // Fetch event financials (manual entries)
      const { data: financials } = await readygo
        .from("event_financials")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      const regs = (completedRegs || []).filter(r => r.payment_status === "completed");
      const sponsored = (completedRegs || []).filter(r => r.payment_status === "sponsored");
      const otos = otoPurchases || [];

      // OTO from registrations
      const oto1RevenueFromRegs = regs.reduce((sum, r) => sum + (r.oto1_amount || 0), 0);
      const oto2RevenueFromRegs = regs.reduce((sum, r) => sum + (r.oto2_amount || 0), 0);
      const oto1CountFromRegs = regs.filter(r => r.oto1_booked && (r.oto1_amount || 0) > 0).length;
      const oto2CountFromRegs = regs.filter(r => r.oto2_accepted && (r.oto2_amount || 0) > 0).length;

      // OTO from purchases
      const oto1RevenueFromPurchases = otos.filter(o => o.oto_type === "oto1").reduce((sum, o) => sum + (o.price || 0), 0);
      const oto2RevenueFromPurchases = otos.filter(o => o.oto_type === "oto2").reduce((sum, o) => sum + (o.price || 0), 0);
      const oto1CountFromPurchases = otos.filter(o => o.oto_type === "oto1").length;
      const oto2CountFromPurchases = otos.filter(o => o.oto_type === "oto2").length;

      const oto1Revenue = oto1RevenueFromRegs > 0 ? oto1RevenueFromRegs : oto1RevenueFromPurchases;
      const oto2Revenue = oto2RevenueFromRegs > 0 ? oto2RevenueFromRegs : oto2RevenueFromPurchases;
      const oto1Count = oto1CountFromRegs > 0 ? oto1CountFromRegs : oto1CountFromPurchases;
      const oto2Count = oto2CountFromRegs > 0 ? oto2CountFromRegs : oto2CountFromPurchases;

      // Category breakdown
      const categoryBreakdown: Record<string, number> = {};
      regs.forEach(r => {
        const cat = r.selected_age_category || "ไม่ระบุ";
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
      });

      const totalRegFee = regs.reduce((s, r) => s + (r.registration_fee || 0), 0);
      const totalDiscount = regs.reduce((s, r) => s + (r.multi_day_discount_applied || 0) + (r.discount_amount || 0), 0);
      const totalCruzeeDiscount = regs.reduce((s, r) => s + (r.cruzee_discount_amount || 0), 0);
      const actualRevenue = totalRegFee - totalDiscount;

      const totalExpenses = (financials || [])
        .filter(f => f.category === "expense")
        .reduce((s, f) => s + f.amount, 0);

      const totalOtherIncome = (financials || [])
        .filter(f => f.category === "income")
        .reduce((s, f) => s + f.amount, 0);

      const netProfit = actualRevenue + oto1Revenue + oto2Revenue + totalOtherIncome - totalExpenses;

      return new Response(JSON.stringify({
        event,
        registrationStats: {
          total_registrations: regs.length + sponsored.length,
          completed_count: regs.length,
          sponsored_count: sponsored.length,
          total_registration_fee: totalRegFee,
          total_discount: totalDiscount,
          total_cruzee_discount: totalCruzeeDiscount,
          actual_revenue: actualRevenue,
          oto1_revenue: oto1Revenue,
          oto1_count: oto1Count,
          oto2_revenue: oto2Revenue,
          oto2_count: oto2Count,
          total_oto_revenue: oto1Revenue + oto2Revenue,
          category_breakdown: categoryBreakdown,
        },
        financials: financials || [],
        summary: {
          totalExpenses,
          totalOtherIncome,
          netProfit,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
