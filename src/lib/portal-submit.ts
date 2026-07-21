import { supabase } from "@/integrations/supabase/client";

export interface PortalFilePayload {
  name: string;
  mime: string;
  data_b64: string;
}

export async function fileToBase64(file: File): Promise<PortalFilePayload> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: file.name,
    mime: file.type || "application/octet-stream",
    data_b64: btoa(binary),
  };
}

export interface PortalSubmitArgs {
  action: string;
  owner: string;
  lineAccessToken: string;
  payload?: Record<string, unknown>;
  file?: PortalFilePayload;
}

export async function callPortalSubmit<T = any>(args: PortalSubmitArgs): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-submit", { body: args });
  if (error) {
    // supabase functions.invoke wraps HTTP errors; try to read body
    const inner = (data as any)?.error || error.message || "request_failed";
    throw new Error(inner);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}