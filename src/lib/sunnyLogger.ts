export type SunnyLogPayload = {
  role: "user" | "assistant";
  type: "message" | "ucs";
  text: string;
  service_key?: string;
  lead_detected?: boolean;
  lead_reason?: string;
  handoff_requested?: boolean;
  phone?: string;
  email?: string;
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
  if (typeof window === "undefined") return;

  if (!LOG_URL) {
    console.warn("[SUNNY-CLIENT-LOG] NEXT_PUBLIC_SUNNY_LOG_URL is not set; skipping client log send.");
    return;
  }

  try {
    const sessionId = getSessionId();
    const knownName = window.localStorage.getItem("sunny_known_name");
    const knownPhone = window.localStorage.getItem("sunny_known_phone") || "";
    const knownEmail = window.localStorage.getItem("sunny_known_email") || "";

    console.log("[SUNNY-CLIENT-LOG] sending", { role: payload.role, type: payload.type, sessionId });

    void fetch(LOG_URL, {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        known_name: knownName,
        role: payload.role,
        type: payload.type,
        service_key: payload.service_key,
        text: payload.text,
        lead_detected: payload.lead_detected ?? false,
        lead_reason: payload.lead_reason ?? "",
        handoff_requested: payload.handoff_requested ?? false,
        phone: payload.phone ?? knownPhone,
        email: payload.email ?? knownEmail,
        url: window.location.href,
        user_agent: navigator.userAgent,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error("[SUNNY-CLIENT-LOG] request failed", response.status);
          return;
        }
        console.log("[SUNNY-CLIENT-LOG] sent successfully");
      })
      .catch((error) => {
        console.error("[SUNNY-CLIENT-LOG] network error", error);
      });
  } catch (error) {
    console.error("[SUNNY-CLIENT-LOG] unexpected error", error);
  }
};
