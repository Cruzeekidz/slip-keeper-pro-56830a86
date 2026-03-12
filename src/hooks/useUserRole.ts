import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsSuperAdmin(false);
      setIsAdmin(false);
      setRoleLoading(false);
      return;
    }

    const checkRole = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (!error && data) {
        const roles = data.map(r => r.role);
        setIsSuperAdmin(roles.includes('super_admin'));
        setIsAdmin(roles.includes('admin') || roles.includes('super_admin'));
      } else {
        setIsSuperAdmin(false);
        setIsAdmin(false);
      }
      setRoleLoading(false);
    };

    checkRole();
  }, [user, authLoading]);

  return { isSuperAdmin, isAdmin, loading: authLoading || roleLoading };
}
