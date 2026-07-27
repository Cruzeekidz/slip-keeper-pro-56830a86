export const PORTAL_OWNER_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Main Cruzee Finance admin owner. Used when LINE rich-menu links omit owner=...
// so existing staff/vendor portal links keep working after LIFF security hardening.
const DEFAULT_PORTAL_OWNER_ID = "6173693c-153d-42de-bb6c-388a4798295f";

export const resolvePortalOwnerId = (owner?: string | null): string => {
  const trimmedOwner = (owner || "").trim();
  if (PORTAL_OWNER_UUID_REGEX.test(trimmedOwner) && trimmedOwner !== "YOUR_USER_ID") {
    return trimmedOwner;
  }
  return DEFAULT_PORTAL_OWNER_ID;
};