import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const safeFilename = (value: string) => value.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9._-]+/g, "_").slice(0, 120);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.searchParams.get("path")?.trim();
    const forceDownload = url.searchParams.get("download") === "1";
    if (!path || path.includes("..") || path.startsWith("/")) {
      return new Response(JSON.stringify({ error: "Invalid file path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: receipt, error: receiptError } = await admin
      .from("expenses")
      .select("id, expense_date, amount, description, receipt_url")
      .eq("user_id", userData.user.id)
      .eq("receipt_url", path)
      .limit(1)
      .maybeSingle();

    if (receiptError) throw receiptError;
    if (!receipt) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: file, error: downloadError } = await admin.storage.from("receipts").download(path);
    if (downloadError || !file) {
      const status = (downloadError as any)?.statusCode === "404" ? 404 : 500;
      console.error("receipt-file download failed", { path, downloadError });
      return new Response(
        JSON.stringify({ error: status === 404 ? "ไฟล์ไม่พบในคลัง (อาจถูกลบแล้ว)" : "ไม่สามารถดาวน์โหลดไฟล์ได้" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = path.toLowerCase().endsWith(".pdf") ? "pdf" : path.split(".").pop()?.toLowerCase() || "jpg";
    const filename = safeFilename(`receipt_${receipt.expense_date}_${Math.round(Number(receipt.amount || 0))}_${receipt.description || receipt.id}.${ext}`);
    const contentType = file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");

    return new Response(file, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("receipt-file error", error);
    return new Response(JSON.stringify({ error: "Unable to load receipt" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});