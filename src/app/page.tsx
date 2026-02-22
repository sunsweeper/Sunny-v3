"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

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

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hey! I'm Sunny from SunSweeper 🌞\n\n" +
    "I'm here to give you straight answers on solar panel cleaning, roof washing, bird proofing, gutters — pricing, scheduling, what to expect on the Central Coast, and anything else you need.\n\n" +
    "No runaround, no sales pitch. Just ask away — what's on your mind?",
};

const SERVICE_PROMPTS: Record<ServiceKey, string[]> = {
  solarPanelCleaning: [
    "Solar panel cleaning — got it. Dirt and bird droppings can quietly cut your production by 15–30% here on the Central Coast. I can walk you through when cleaning pays off, our safe method, and rough pricing for your setup. Where do you want to start?",
    "Panels usually look cleaner than they actually are. Let's figure out if yours need attention right now, how we clean without damage, and what kind of energy boost people typically see. Questions about process, cost, or timing?",
    "You're in the right spot for solar panel questions. I can explain frequency recommendations for your area, what affects output most, and clear pricing options. What would help you decide?",
  ],
  birdProofing: [
    "Bird proofing time — birds love turning solar arrays into nesting zones around here. I can explain the damage they cause, our humane mesh solutions, and how we make sure they don't come back. What are you noticing under your panels?",
    "Under-panel bird activity is more common than most people think — droppings, nests, even fire risks. Want the short version of how we fix it permanently, or details on cost and install?",
    "Pigeons and other birds pick favorite roofs and keep returning. I can break down why, what damage looks like over time, and our proven proofing approach. Tell me what you're dealing with.",
  ],
  roofWashing: [
    "Roof washing — algae, moss, and stains build up fast in our coastal climate. I can help you understand what's safe for your roof type, when it's worth doing, and pricing. What's the current condition like?",
    "A clean roof lasts longer and looks way better. I can walk through our low-pressure soft-wash method (never high-pressure), frequency, and whether it's mostly cosmetic or protective for you. Where should we begin?",
    "Roofs don't come with warning lights. Let's talk about what we see most often in Santa Barbara & SLO counties, safe cleaning options, and costs — no pressure, just info.",
  ],
  gutterCleaningRepair: [
    "Gutters — they only get attention when something overflows or sags. I can help check if you're due for cleaning, spot early repair needs, or prevent future issues. What's going on with yours?",
    "Blocked or damaged gutters cause bigger problems fast (water damage, foundation issues). Want to know our cleaning process, common repairs we handle, or ballpark pricing?",
    "Gutters should be invisible — when they're not, it's usually leaves, debris, or wear. I can explain prevention tips, what we inspect, and fixes. What's the situation?",
  ],
  pressureWashing: [
    "Pressure washing — let's clarify what surface we're talking about. We use low-pressure soft washing for most jobs (safe for roofs, siding, solar panels), never high-pressure blasting that can cause damage. What's the area you want cleaned?",
    "We avoid aggressive high-pressure on delicate surfaces here on the coast. I can explain our gentle approach, when it's appropriate, and rough pricing. What are you looking to wash?",
  ],
  gutterLeakRepair: [
    "Gutter leak repair — leaks often start at seams, holes, or poor slope. I can help identify the cause from what you're seeing and explain our fix options (sealing, patching, or section replacement). What's happening with your gutters?",
    "Even small leaks can lead to big water damage quickly. Tell me the symptoms (drips, stains, overflow) and I'll give you next steps and ballpark costs.",
  ],
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "birdProofing", label: "Bird Proofing" },
  { key: "roofWashing", label: "Roof Wash" },
  { key: "pressureWashing", label: "Pressure Washing" },
  { key: "gutterCleaningRepair", label: "Gutter Cleaning" },
  { key: "gutterLeakRepair", label: "Gutter Leak Repair" },
];

const QUICK_SUGGESTIONS = [
  "How much does solar panel cleaning cost?",
  "Do you handle bird proofing for solar panels?",
  "What's involved in a roof wash?",
  "When should I clean my gutters?",
  "What areas do you serve in Santa Barbara County?",
];

const getRandomServicePrompt = (service: ServiceKey): string => {
  const promptOptions = SERVICE_PROMPTS[service];
  const randomIndex = Math.floor(Math.random() * promptOptions.length);
  return promptOptions[randomIndex];
};

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [chatState, setChatState] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const chatShellRef = useRef<HTMLElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = useMemo(
    () => messages.length > 1 || activeService !== null,
    [messages.length, activeService]
  );

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
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        state?: Record<string, unknown>;
      };

      const reply = data.reply?.trim() || "I’m sorry—something went wrong while responding.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (data.state) {
        setChatState(data.state);
      }
    } catch (error) {
      console.error("Chat fetch error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I’m having trouble right now. Please try again in a moment." },
      ]);
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
    const selectedPrompt = getRandomServicePrompt(service);
    setActiveService(service);
    setMessages([{ role: "assistant", content: selectedPrompt }]);
    setChatState((prev) => ({ ...prev, selectedService: service }));
    chatShellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const showQuickSuggestions = messages.length === 1 && !activeService && !isLoading;

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
          {!hasMessages && (
            <p className="helper-text">Say hi, ask a question, or pick a service above when you're ready.</p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                {isUser ? (
                  <Image src="/user-avatar.png" alt="User avatar" width={84} height={84} className="user-avatar" />
                ) : (
                  <Image src="/sunny-avatar.png" alt="Sunny avatar" width={84} height={84} className="sunny-avatar" />
                )}
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
              <Image src="/sunny-avatar.png" alt="Sunny avatar" width={84} height={84} className="sunny-avatar" />
              <div>
                <p className="typing">Sunny is thinking...</p>
              </div>
            </div>
          )}

          {showQuickSuggestions && (
            <div
              className="quick-suggestions"
              style={{
                margin: "1.5rem 0",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                justifyContent: "center",
                padding: "0 1rem",
              }}
            >
              {QUICK_SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setInput(q);
                    // Uncomment next line to auto-send on suggestion click:
                    // void handleSend();
                  }}
                  className="suggestion-btn"
                  style={{
                    padding: "0.6rem 1.1rem",
                    borderRadius: "1.5rem",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    transition: "background 0.2s",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="input-wrap">
          <label htmlFor="chat-input" className="sr-only">
            Message Sunny
          </label>
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
            <span className="send-label">Send</span>
          </button>
        </div>
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
        {/* Your footer content goes here – unchanged */}
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: "32px",
          }}
        >
          {/* ... footer columns ... */}
        </div>
        {/* ... hr and copyright ... */}
      </footer>
    </main>
  );
}
