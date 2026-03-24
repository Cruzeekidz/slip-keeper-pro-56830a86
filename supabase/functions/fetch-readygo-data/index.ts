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

      const financialsResponse = await fetch(
        `${readygoUrl}/functions/v1/get-event-financials?event_id=${encodeURIComponent(eventId)}`,
        {
          method: "GET",
          headers: {
            apikey: readygoKey,
            Authorization: `Bearer ${readygoKey}`,
          },
        }
      );

      const financialsPayload = await financialsResponse.json();

      if (!financialsResponse.ok) {
        return new Response(JSON.stringify({
          error: financialsPayload?.error || "Failed to fetch Ready-go financials",
          details: financialsPayload,
        }), {
          status: financialsResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const categoryBreakdown: Record<string, number> = {};

      return new Response(JSON.stringify({
        event: financialsPayload.event,
        registrationStats: {
          ...financialsPayload.registrationStats,
          completed_count:
            (financialsPayload.registrationStats?.total_registrations || 0) -
            (financialsPayload.registrationStats?.sponsored_count || 0),
          total_discount:
            (financialsPayload.registrationStats?.total_multi_day_discount || 0) +
            (financialsPayload.registrationStats?.total_other_discounts || 0),
          category_breakdown: financialsPayload.registrationStats?.category_breakdown || categoryBreakdown,
        },
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
