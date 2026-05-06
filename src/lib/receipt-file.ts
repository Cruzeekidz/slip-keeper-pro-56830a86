import { supabase } from "@/integrations/supabase/client";

export async function getReceiptFileUrl(path: string, forceDownload = false) {
  const { data: sessionData, error } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (error || !token) throw error || new Error("Not authenticated");

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receipt-file`;
  const params = new URLSearchParams({ path });
  if (forceDownload) params.set("download", "1");
  return { url: `${baseUrl}?${params.toString()}`, token };
}

export async function downloadReceiptFile(path: string) {
  const { url, token } = await getReceiptFileUrl(path, true);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}