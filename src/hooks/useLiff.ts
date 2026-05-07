import { useState, useEffect } from "react";

// LIFF ID is public (not a secret). Keep a fallback so the published portal can
// still identify LINE users even when the env value is not injected.
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008893199-xaJITz5y";

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export const useLiff = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [lineProfile, setLineProfile] = useState<LiffProfile | null>(null);
  const [isInLineApp, setIsInLineApp] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!LIFF_ID) {
      setIsReady(true);
      return;
    }

    const initLiff = async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: LIFF_ID });

        const inLineClient = liff.isInClient();
        setIsInLineApp(inLineClient);

        if (!liff.isLoggedIn() && inLineClient) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          setLineProfile({
            userId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          });
        }
      } catch (err) {
        console.error("LIFF init error:", err);
      } finally {
        setIsReady(true);
      }
    };

    initLiff();
  }, []);

  return { lineUserId, lineProfile, isInLineApp, isReady };
};
