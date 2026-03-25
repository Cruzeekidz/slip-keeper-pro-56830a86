import { useState, useEffect } from "react";

// LIFF ID - ต้องตั้งค่าใน LINE Developers Console
// ให้เปลี่ยนค่านี้เป็น LIFF ID จริงของคุณ
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "";

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

        setIsInLineApp(liff.isInClient());

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
