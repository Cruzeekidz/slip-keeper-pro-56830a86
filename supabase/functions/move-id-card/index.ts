// One-shot utility to move an ID card file from receipts → documents bucket
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { srcPath, dstPath, staffId } = await req.json();
    if (!srcPath || !dstPath || !staffId) {
      return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers: corsHeaders });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Download from receipts
    const { data: file, error: dlErr } = await sb.storage.from("receipts").download(srcPath);
    if (dlErr) throw new Error("download: " + dlErr.message);
    const buf = new Uint8Array(await file.arrayBuffer());

    // Upload to documents
    const { error: upErr } = await sb.storage.from("documents").upload(dstPath, buf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) throw new Error("upload: " + upErr.message);

    // Update staff profile
    await sb.from("staff_profiles").update({ id_card_url: dstPath }).eq("id", staffId);

    return new Response(JSON.stringify({ ok: true, dstPath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
