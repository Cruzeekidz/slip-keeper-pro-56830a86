import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useExpensesRealtime(onUpdate: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel('expenses-realtime-shared')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
