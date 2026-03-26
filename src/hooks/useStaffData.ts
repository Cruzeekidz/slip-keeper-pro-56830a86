import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface StaffProfile {
  id: string;
  user_id: string;
  staff_name: string;
  nickname: string | null;
  position: string | null;
  tax_id: string | null;
  daily_rate: number;
  phone: string | null;
  line_user_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  id_card_url: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export type { StaffProfile };

const QUERY_KEY = ["staff-profiles"] as const;

export function useStaffProfiles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("*")
        .order("staff_name");
      if (error) throw error;
      return data as StaffProfile[];
    },
    enabled: !!user,
  });
}

export interface StaffFormValues {
  staff_name: string;
  nickname: string;
  position: string;
  tax_id: string;
  daily_rate: number;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  address: string;
}

export const emptyStaffForm: StaffFormValues = {
  staff_name: "",
  nickname: "",
  position: "",
  tax_id: "",
  daily_rate: 0,
  phone: "",
  email: "",
  bank_name: "",
  bank_account: "",
  address: "",
};

async function uploadIdCard(file: File, userId: string, staffId: string): Promise<string | null> {
  const ext = file.name.split(".").pop();
  const path = `${userId}/id-cards/${staffId}.${ext}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (error) { console.error(error); return null; }
  return path;
}

export function useSaveStaff(editingId: string | null, idCardFile: File | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: StaffFormValues) => {
      if (!user) throw new Error("Not authenticated");

      if (editingId) {
        const updatePayload: Record<string, unknown> = {
          ...values,
          daily_rate: Number(values.daily_rate),
        };
        if (idCardFile) {
          const url = await uploadIdCard(idCardFile, user.id, editingId);
          if (url) updatePayload.id_card_url = url;
        }
        const { error } = await supabase.from("staff_profiles").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("staff_profiles").insert({
          staff_name: values.staff_name,
          nickname: values.nickname || null,
          position: values.position || null,
          tax_id: values.tax_id || null,
          daily_rate: Number(values.daily_rate),
          phone: values.phone || null,
          email: values.email || null,
          bank_name: values.bank_name || null,
          bank_account: values.bank_account || null,
          address: values.address || null,
          user_id: user.id,
        }).select("id").single();
        if (error) throw error;
        if (idCardFile && data) {
          const url = await uploadIdCard(idCardFile, user.id, data.id);
          if (url) {
            await supabase.from("staff_profiles").update({ id_card_url: url }).eq("id", data.id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: editingId ? "แก้ไขสำเร็จ" : "เพิ่มทีมงานสำเร็จ" });
    },
    onError: () => {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });
}

export function useDeleteStaff() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "ลบทีมงานสำเร็จ" });
    },
  });
}
