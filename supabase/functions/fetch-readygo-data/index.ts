import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

      const financialsPayload = await fetchEventFinancials(readygoUrl, readygoKey, eventId);

      return new Response(JSON.stringify({
        event: financialsPayload.event,
        registrationStats: mapRegistrationStats(financialsPayload),
        financials: financialsPayload.financials || [],
        summary: {
          totalExpenses: financialsPayload.summary?.totalExpenses || 0,
          totalOtherIncome: financialsPayload.summary?.totalOtherIncome || 0,
          netProfit: financialsPayload.summary?.netProfit || 0,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // New action: fetch financials for multiple events and aggregate
    if (action === "multi-event-financials") {
      const eventIds: string[] = body?.event_ids;

      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return new Response(JSON.stringify({ error: "event_ids array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch all events in parallel
      const results = await Promise.allSettled(
        eventIds.map(id => fetchEventFinancials(readygoUrl, readygoKey, id))
      );

      // Aggregate stats
      const aggregated = {
        total_registrations: 0,
        completed_count: 0,
        sponsored_count: 0,
        total_registration_fee: 0,
        total_discount: 0,
        total_cruzee_discount: 0,
        actual_revenue: 0,
        oto1_revenue: 0,
        oto1_count: 0,
        oto2_revenue: 0,
        oto2_count: 0,
        total_oto_revenue: 0,
        category_breakdown: {} as Record<string, number>,
      };
      let totalExpenses = 0;
      let totalOtherIncome = 0;
      const allFinancials: any[] = [];
      const eventDetails: any[] = [];

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const payload = r.value;
        const stats = payload.registrationStats || {};

        eventDetails.push(payload.event);

        aggregated.total_registrations += Number(stats.total_registrations || 0);
        aggregated.sponsored_count += Number(stats.sponsored_count || 0);
        aggregated.total_registration_fee += Number(stats.total_registration_fee || 0);
        aggregated.total_cruzee_discount += Number(stats.total_cruzee_discount || 0);
        aggregated.oto1_revenue += Number(stats.oto1_revenue || 0);
        aggregated.oto1_count += Number(stats.oto1_count || 0);
        aggregated.oto2_revenue += Number(stats.oto2_revenue || 0);
        aggregated.oto2_count += Number(stats.oto2_count || 0);
        aggregated.total_oto_revenue += Number(stats.total_oto_revenue || 0);

        const multiDiscount = Number(stats.total_multi_day_discount || 0);
        const otherDiscount = Number(stats.total_other_discounts || 0);
        aggregated.total_discount += multiDiscount + otherDiscount;
        aggregated.actual_revenue += Number(stats.actual_revenue || 0);

        // Category breakdown
        const cb = stats.category_breakdown || {};
        for (const [key, val] of Object.entries(cb)) {
          aggregated.category_breakdown[key] = (aggregated.category_breakdown[key] || 0) + Number(val);
        }

        totalExpenses += Number(payload.summary?.totalExpenses || 0);
        totalOtherIncome += Number(payload.summary?.totalOtherIncome || 0);
        if (payload.financials) allFinancials.push(...payload.financials);
      }

      aggregated.completed_count = aggregated.total_registrations - aggregated.sponsored_count;

      return new Response(JSON.stringify({
        events: eventDetails,
        registrationStats: aggregated,
        financials: allFinancials,
        summary: {
          totalExpenses,
          totalOtherIncome,
          netProfit: aggregated.actual_revenue + aggregated.total_oto_revenue + totalOtherIncome - totalExpenses,
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

async function fetchEventFinancials(readygoUrl: string, readygoKey: string, eventId: string) {
  const resp = await fetch(
    `${readygoUrl}/functions/v1/get-event-financials?event_id=${encodeURIComponent(eventId)}`,
    {
      method: "GET",
      headers: {
        apikey: readygoKey,
        Authorization: `Bearer ${readygoKey}`,
      },
    }
  );
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Failed to fetch financials for ${eventId}: ${errBody}`);
  }
  return await resp.json();
}

function mapRegistrationStats(payload: any) {
  const stats = payload.registrationStats || {};
  return {
    ...stats,
    completed_count:
      (Number(stats.total_registrations) || 0) - (Number(stats.sponsored_count) || 0),
    total_discount:
      (Number(stats.total_multi_day_discount) || 0) + (Number(stats.total_other_discounts) || 0),
    category_breakdown: stats.category_breakdown || {},
  };
}
