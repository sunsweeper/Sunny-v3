"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { frustrationDelta, shouldOfferHandoff } from "../lib/frustration";
import { detectHumanRequest, detectLeadReason, extractEmail, extractPhone } from "../lib/leadSignals";
import { ucsContent, universalFollowUps, type UcsServiceKey } from "../lib/ucsContent";
import { logSunny } from "../lib/sunnyLogger";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ServiceKey =
  | "solarPanelCleaning"
  | "birdProofing"
  | "roofWashing"
  | "gutterCleaningRepair"
  | "pressureWashing"
  | "gutterLeakRepair";

const getInitialGreeting = (name: string | null): Message => ({
  role: "assistant",
  content: name
    ? `Hey ${name}, welcome to SunSweeper.com. How can I help you today?`
    : "Hey, welcome to SunSweeper.com. How can I help you today?",
});

const SERVICE_TO_UCS_KEY: Record<ServiceKey, UcsServiceKey> = {
  solarPanelCleaning: "solar_panel_cleaning",
  birdProofing: "bird_proofing",
  roofWashing: "roof_cleaning",
  gutterCleaningRepair: "gutter_cleaning",
  pressureWashing: "exterior_cleaning",
  gutterLeakRepair: "gutter_repair_install",
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "birdProofing", label: "Bird Proofing" },
  { key: "roofWashing", label: "Roof Wash" },
  { key: "pressureWashing", label: "Pressure Washing" },
  { key: "gutterCleaningRepair", label: "Gutter Cleaning" },
  { key: "gutterLeakRepair", label: "Gutter Leak Repair" },
];

const getRandomItem = <T,>(items: readonly T[]): T => {
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
};

const sanitizeKnownName = (value: string | null): string | null => {
  if (!value) return null;
  const firstToken = value.trim().split(/\s+/)[0] ?? "";
  const lettersOnly = firstToken.replace(/[^A-Za-z]/g, "");
  if (lettersOnly.length < 2 || lettersOnly.length > 20) return null;

  const normalized = lettersOnly.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const withOptionalName = (followUp: string, knownName: string | null): string => {
  if (!knownName) return followUp;
  return followUp.replace(/\?$/, `, ${knownName}?`);
};

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([getInitialGreeting(null)]);
  const [chatState, setChatState] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const [sessionId, setSessionId] = useState("sunny-session-fallback");
  const [knownName, setKnownName] = useState<string | null>(null);
  const [clientFrustrationScore, setClientFrustrationScore] = useState(0);
  const [lastClientHandoffOfferedAt, setLastClientHandoffOfferedAt] = useState<number | null>(null);
  const [clientHandoffActive] = useState(false);
  const chatShellRef = useRef<HTMLElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);



  useEffect(() => {
    const existing = window.localStorage.getItem("sunny_session_id");
    if (existing) {
      setSessionId(existing);
    } else {
      const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sunny-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem("sunny_session_id", generated);
      setSessionId(generated);
    }

    const storedName = sanitizeKnownName(window.localStorage.getItem("sunny_known_name"));
    setKnownName(storedName);
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.role !== "assistant") return prev;
      return [getInitialGreeting(storedName)];
    });
  }, []);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;

    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const extractedEmail = extractEmail(trimmed);
    const extractedPhone = extractPhone(trimmed);

    if (extractedEmail) {
      window.localStorage.setItem("sunny_known_email", extractedEmail);
    }

    if (extractedPhone) {
      window.localStorage.setItem("sunny_known_phone", extractedPhone);
    }

    const email = window.localStorage.getItem("sunny_known_email") || "";
    const phone = window.localStorage.getItem("sunny_known_phone") || "";
    const { lead_detected, lead_reason } = detectLeadReason(trimmed);

    const now = Date.now();
    const nextFrustrationScore = Math.max(0, clientFrustrationScore - 1) + frustrationDelta(trimmed);
    const frustrationTriggered = shouldOfferHandoff({
      frustrationScore: nextFrustrationScore,
      handoffActive: clientHandoffActive,
      lastHandoffOfferedAt: lastClientHandoffOfferedAt,
      now,
    });

    setClientFrustrationScore(nextFrustrationScore);
    if (frustrationTriggered) {
      setLastClientHandoffOfferedAt(now);
    }

    logSunny({
      role: "user",
      type: "message",
      text: trimmed,
      lead_detected,
      lead_reason,
      phone,
      email,
      handoff_requested: frustrationTriggered || detectHumanRequest(trimmed) || lead_detected,
    });

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          state: chatState,
          messages: nextMessages,
          sessionId,
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        state?: Record<string, unknown>;
      };

      const reply = data.reply?.trim() || "I’m sorry—something went wrong while responding.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      logSunny({
        role: "assistant",
        type: "message",
        text: reply,
        lead_detected: false,
        lead_reason: "",
        handoff_requested: false,
      });
      if (data.state) setChatState(data.state);
    } catch (error) {
      console.error("Chat fetch error:", error);
      const fallbackReply = "I’m having trouble right now. Please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fallbackReply },
      ]);
      logSunny({
        role: "assistant",
        type: "message",
        text: fallbackReply,
        lead_detected: false,
        lead_reason: "",
        handoff_requested: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleServiceClick = (service: ServiceKey) => {
    const ucsKey = SERVICE_TO_UCS_KEY[service];
    const serviceLine = getRandomItem(ucsContent[ucsKey]);
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    let universalFollowUp = getRandomItem(universalFollowUps);
    let attempts = 0;

    while (lastAssistantMessage.endsWith(withOptionalName(universalFollowUp, knownName)) && attempts < 4) {
      universalFollowUp = getRandomItem(universalFollowUps);
      attempts += 1;
    }

    const followUpWithOptionalName = withOptionalName(universalFollowUp, knownName);

    const ucsMessage = `${serviceLine}\n\n${followUpWithOptionalName}`;

    setActiveService(service);
    setMessages((prev) => [...prev, { role: "assistant", content: ucsMessage }]);
    logSunny({
      role: "assistant",
      type: "ucs",
      service_key: ucsKey,
      text: ucsMessage,
      lead_detected: false,
      lead_reason: "",
      handoff_requested: false,
    });
    setChatState((prev) => ({ ...prev, selectedService: service }));
    chatShellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="headline">The solar panel and roof cleaning experts.</p>
        <Image src="/logo.png" alt="SunSweeper logo" width={640} height={350} className="hero-logo" priority />

        <div className="contact-wrap">
          <a
            className="phone"
            href="tel:8059381515"
            aria-label="Call SunSweeper at 805-938-1515"
            style={{
              fontSize: "1.75rem",
              fontWeight: "900",
              lineHeight: "1.1",
              letterSpacing: "-0.01em",
              display: "block",
              textAlign: "center",
              margin: "1.25rem 0 0.75rem 0",
              color: "#ffffff",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            805-938-1515
          </a>
          <p className="contact-line">
            Call <span>or</span> text <small>for a live human</small>
          </p>
        </div>

        <nav className="service-nav" aria-label="Core services">
          {SERVICE_OPTIONS.map((service, index) => {
            const isActive = activeService === service.key;
            return (
              <Fragment key={service.key}>
                {index > 0 && (
                  <span className="service-divider" aria-hidden="true">
                    |
                  </span>
                )}
                <button
                  type="button"
                  className={`service-link ${isActive ? "active" : ""}`}
                  onClick={() => handleServiceClick(service.key)}
                >
                  {service.label}
                </button>
              </Fragment>
            );
          })}
        </nav>
      </section>

      <section ref={chatShellRef} className="chat-shell">
        <div ref={messagesRef} className="messages">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                <div className={`bubble ${isUser ? "user-bubble" : "assistant-bubble"}`}>
                  {message.content.split("\n").map((line, i) => (
                    <p key={i} style={{ margin: line.trim() ? "0.35em 0" : "0.8em 0" }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="msg-row assistant">
              <div>
                <p className="typing">Sunny is thinking...</p>
              </div>
            </div>
          )}
        </div>

        <div className="input-wrap">
          <textarea
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask about pricing, scheduling, services..."
            className="chat-input"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            className="send-btn"
            aria-label="Send message to Sunny"
          >
            <span aria-hidden="true">➤</span>
            <span className="send-label" style={{ fontWeight: 800, color: "#fff" }}>
              Send
            </span>
          </button>
        </div>
        <p className="helper-text" style={{ marginTop: "0.9rem", fontSize: "0.8rem", textAlign: "center" }}>
          Not getting what you need from Sunny? Tell him you’d like to speak with a live person — he’ll take a
          message and get it to a specialist.
        </p>
      </section>

      <footer className="beta-footer" />

      <footer
        style={{
          background: "#0f172a",
          color: "#e5e7eb",
          padding: "48px 24px",
          fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        {/* Your full footer content here */}
      </footer>
    </main>
  );
}
