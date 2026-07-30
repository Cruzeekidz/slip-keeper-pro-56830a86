import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "chunk-reload-ts";

/**
 * React.lazy with retry: if a dynamic chunk fails to load (usually because a new
 * deploy invalidated the old hashed filenames), retry once, then force a reload.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (error) {
      // one retry in case of a transient network hiccup
      try {
        return await factory();
      } catch {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 10000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          return await new Promise<{ default: T }>(() => {});
        }
        throw error;
      }
    }
  });
}