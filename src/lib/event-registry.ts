import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures a (project_tag, event_name) pair exists in event_registry for the user.
 * Safe to call after every expense save — no-op if a matching active row exists.
 */
export async function autoRegisterEventTag(opts: {
  userId: string;
  projectTag?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
}): Promise<void> {
  const tag = (opts.projectTag || "").trim();
  const name = (opts.eventName || "").trim();
  if (!tag && !name) return;

  try {
    // Check by tag first (preferred key), fallback to name
    const orParts: string[] = [];
    if (tag) orParts.push(`project_tag.eq.${tag}`);
    if (name) orParts.push(`event_name.eq.${name}`);
    const { data: existing } = await supabase
      .from("event_registry")
      .select("id, project_tag, event_name")
      .eq("user_id", opts.userId)
      .or(orParts.join(","))
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Fill in a missing event name on an existing tag row so it shows up in dropdowns
      if (name && !(existing.event_name || "").trim()) {
        await supabase.from("event_registry").update({ event_name: name }).eq("id", existing.id);
      }
      // A new event name under an already-registered tag still deserves its own row
      if (name && (existing.event_name || "").trim() && existing.event_name !== name) {
        const { data: byName } = await supabase
          .from("event_registry")
          .select("id")
          .eq("user_id", opts.userId)
          .eq("event_name", name)
          .limit(1)
          .maybeSingle();
        if (!byName) {
          await supabase.from("event_registry").insert({
            user_id: opts.userId,
            project_tag: tag || name,
            event_name: name,
            event_date: opts.eventDate || null,
            aliases: [],
            is_active: true,
          });
        }
      }
      return;
    }

    await supabase.from("event_registry").insert({
      user_id: opts.userId,
      project_tag: tag || name,
      event_name: name || tag,
      event_date: opts.eventDate || null,
      aliases: [],
      is_active: true,
    });
  } catch (err) {
    console.warn("autoRegisterEventTag failed:", err);
  }
}