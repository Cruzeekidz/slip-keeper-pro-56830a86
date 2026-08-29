import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildEventOptions, EventTagOption, FIXED_TAG_OPTIONS } from "@/lib/event-tags";

/**
 * Loads the event list for slip forms from event_registry.
 * Near-term events (−60/+90 days) are surfaced first; everything else stays searchable.
 */
export function useEventOptions() {
  const [options, setOptions] = useState<EventTagOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("event_registry")
        .select("event_name, project_tag, event_date, is_active, entity")
        .order("event_date", { ascending: false, nullsFirst: false })
        .limit(2000);

      if (cancelled) return;
      setOptions([...buildEventOptions((data as any[]) || []), ...FIXED_TAG_OPTIONS]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nearby = options.filter((o) => o.inWindow);
  return { options, nearby, loading };
}
