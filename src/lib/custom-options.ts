/**
 * Local store for user-typed dropdown options (subcategory, event name, tags...).
 * Keeps newly typed values available in comboboxes immediately and on next visits,
 * even if the DB suggestion query window doesn't include the newest rows.
 */
const PREFIX = "cruzee:custom-options:";

export type CustomOptionKey = "subcategory" | "event_name" | "project_tag" | "payee_group";

export function getCustomOptions(key: CustomOptionKey): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v) => typeof v === "string" && v.trim()) : [];
  } catch {
    return [];
  }
}

export function addCustomOption(key: CustomOptionKey, value?: string | null): void {
  const v = (value || "").trim();
  if (!v) return;
  try {
    const list = getCustomOptions(key);
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    localStorage.setItem(PREFIX + key, JSON.stringify([...list, v].slice(-300)));
  } catch {
    /* ignore */
  }
}

export function removeCustomOption(key: CustomOptionKey, value: string): void {
  try {
    const list = getCustomOptions(key).filter((x) => x !== value);
    localStorage.setItem(PREFIX + key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
