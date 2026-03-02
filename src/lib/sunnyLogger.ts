export type SunnyLogPayload = {
  role: "user" | "assistant";
  type: "message" | "ucs";
  text: string;
  service_key?: string;
};

const LOG_URL = process.env.NEXT_PUBLIC_SUNNY_LOG_URL;

const getSessionId = (): string => {
  const existing = window.localStorage.getItem("sunny_session_id");
  if (existing) return existing;

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sunny-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem("sunny_session_id", generated);
  return generated;
};

export const logSunny = (payload: SunnyLogPayload): void => {
  if (!LOG_URL || typeof window === "undefined") return;

  try {
    const sessionId = getSessionId();
    const knownName = window.localStorage.getItem("sunny_known_name");

    void fetch(LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        session_id: sessionId,
        known_name: knownName,
        role: payload.role,
        type: payload.type,
        service_key: payload.service_key,
        text: payload.text,
        url: window.location.href,
        user_agent: navigator.userAgent,
      }),
    });
  } catch {
    // fail silently
  }
};
