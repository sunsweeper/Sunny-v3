"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ServiceKey = "solarPanelCleaning" | "birdProofing" | "roofWashing" | "gutterCleaningRepair";

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Hey there! I’m Sunny, the SunSweeper AI. I’m here to make things easy—pricing, scheduling, service details, and clear answers about what we do and how we do it. No digging, no guessing. Just ask.",
};

const SERVICE_PROMPTS: Record<ServiceKey, string[]> = {
  solarPanelCleaning: [
    "[Solar Panel Cleaning Placeholder Message 1]",
    "[Solar Panel Cleaning Placeholder Message 2]",
    "[Solar Panel Cleaning Placeholder Message 3]",
    "[Solar Panel Cleaning Placeholder Message 4]",
  ],
  birdProofing: [
    "[Bird Proofing Placeholder Message 1]",
    "[Bird Proofing Placeholder Message 2]",
    "[Bird Proofing Placeholder Message 3]",
    "[Bird Proofing Placeholder Message 4]",
  ],
  roofWashing: [
    "[Roof Washing Placeholder Message 1]",
    "[Roof Washing Placeholder Message 2]",
    "[Roof Washing Placeholder Message 3]",
    "[Roof Washing Placeholder Message 4]",
  ],
  gutterCleaningRepair: [
    "[Gutter Cleaning/Repair Placeholder Message 1]",
    "[Gutter Cleaning/Repair Placeholder Message 2]",
    "[Gutter Cleaning/Repair Placeholder Message 3]",
    "[Gutter Cleaning/Repair Placeholder Message 4]",
  ],
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "birdProofing", label: "Bird Proofing" },
  { key: "roofWashing", label: "Roof Washing" },
  { key: "gutterCleaningRepair", label: "Gutter Cleaning/Repair" },
];

const getRandomServicePrompt = (service: ServiceKey): string => {
  const promptOptions = SERVICE_PROMPTS[service];
  const randomIndex = Math.floor(Math.random() * promptOptions.length);
  return promptOptions[randomIndex];
};

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [currentState, setCurrentState] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }
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
          state: currentState,
          messages: nextMessages,
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        state?: Record<string, unknown>;
      };

      const reply =
        data.reply?.trim() ||
        "I’m sorry—something went wrong while responding.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setCurrentState(data.state ?? currentState);
    } catch (error) {
      console.error("Chat fetch error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I’m having trouble right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleServiceClick = (service: ServiceKey) => {
    const selectedPrompt = getRandomServicePrompt(service);
    setActiveService(service);
    setMessages([{ role: "assistant", content: selectedPrompt }]);
    setCurrentState((prev) => ({ ...prev, selectedService: service }));
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="headline">The Solar Panel and roof cleaning experts.</p>
        <Image src="/logo.png" alt="SunSweeper logo" width={640} height={350} className="hero-logo" priority />
        <div className="contact-wrap">
          <a className="phone" href="tel:8059381515" aria-label="Call SunSweeper at 805-938-1515">
            805-938-1515
          </a>
          <p className="contact-line">
            Call <span>or</span> text <small>for a live human</small>
          </p>
        </div>
        <nav className="service-nav" aria-label="Core services">
          {SERVICE_OPTIONS.map((service) => {
            const isActive = activeService === service.key;
            return (
              <button
                key={service.key}
                type="button"
                className={`service-link ${isActive ? "active" : ""}`}
                onClick={() => handleServiceClick(service.key)}
              >
                {service.label}
              </button>
            );
          })}
        </nav>
      </section>

      <section className="chat-shell">
        <div className="messages">
          {!hasMessages && (
            <p className="helper-text">Say hi, ask a question, or talk shop when you&apos;re ready.</p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                {isUser ? <div className="you-tag">You</div> : <Image src="/sunny-avatar.png" alt="Sunny avatar" width={84} height={84} className="sunny-avatar" />}
                <p className={`bubble ${isUser ? "user-bubble" : "assistant-bubble"}`}>{message.content}</p>
              </div>
            );
          })}

          {isLoading && (
            <div className="msg-row assistant">
              <Image src="/sunny-avatar.png" alt="Sunny avatar" width={84} height={84} className="sunny-avatar" />
              <div>
                <p className="typing">Sunny is responding • • • •</p>
              </div>
            </div>
          )}

          <div ref={endRef} />
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
            placeholder="Enter text here."
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

      <footer className="beta-footer">
        Sunny is currently undergoing beta testing. We encourage you to test him out, but as of today all quotes
        and appointments must be scheduled with a live human at 805-938-1515.
      </footer>

      <footer
        style={{
          background: "#0f172a",
          color: "#e5e7eb",
          padding: "48px 24px",
          fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: "32px",
          }}
        >
          <div>
            <strong style={{ fontSize: "18px" }}>SunSweeper, Inc.</strong>
            <br />
            <span>Professional Solar Panel &amp; Roof Cleaning</span>
            <br />
            <br />
            Serving Santa Barbara County &amp; San Luis Obispo County
          </div>

          <div>
            <strong>Contact</strong>
            <br />
            📞{" "}
            <a href="tel:18059381515" style={{ color: "#e5e7eb" }}>
              805-938-1515
            </a>
            <br />
            ✉️{" "}
            <a href="mailto:info@sunsweeper.com" style={{ color: "#e5e7eb" }}>
              info@sunsweeper.com
            </a>
            <br />
            🕒 8:00am – 7:30pm
          </div>

          <div>
            <strong>Services</strong>
            <br />
            Solar Panel Washing
            <br />
            Roof Washing
            <br />
            Commercial Solar Cleaning
          </div>

          <div>
            <strong>Company</strong>
            <br />
            <a href="/about" style={{ color: "#e5e7eb" }}>
              About SunSweeper
            </a>
            <br />
            <a href="/reviews" style={{ color: "#e5e7eb" }}>
              Reviews
            </a>
            <br />
            <a href="/contact" style={{ color: "#e5e7eb" }}>
              Contact Us
            </a>
          </div>

          <div>
            <strong>Resources</strong>
            <br />
            <a href="/privacy-policy" style={{ color: "#e5e7eb" }}>
              Privacy Policy
            </a>
            <br />
            <a href="/terms-of-service" style={{ color: "#e5e7eb" }}>
              Terms of Service
            </a>
            <br />
            <a href="/cookie-policy" style={{ color: "#e5e7eb" }}>
              Cookie Policy
            </a>
          </div>

          <div>
            <strong>Reviews</strong>
            <br />
            <a href="https://g.page/r/CQ52qP2TmAtxEAE/review" style={{ color: "#e5e7eb" }}>
              Google
            </a>
            <br />
            <a href="https://www.facebook.com/TheSunSweeper/reviews" style={{ color: "#e5e7eb" }}>
              Facebook
            </a>
            <br />
            <a href="https://www.yelp.com/biz/sun-sweeper-santa-maria" style={{ color: "#e5e7eb" }}>
              Yelp
            </a>
            <br />
            <a
              href="https://www.bbb.org/us/ca/santa-maria/profile/solar-panel-cleaning/sunsweeper-1236-92093550"
              style={{ color: "#e5e7eb" }}
            >
              BBB
            </a>
          </div>
        </div>

        <hr style={{ margin: "40px 0", borderColor: "#334155" }} />

        <div style={{ maxWidth: "1200px", margin: "0 auto", textAlign: "center", fontSize: "14px", color: "#cbd5f5" }}>
          <p>
            <strong>Clean panels, more energy. It’s that simple.</strong>
          </p>
          <p>
            Selling a home with solar? <a href="https://sunpasssolar.com" style={{ color: "#93c5fd" }}>Explore SunPass</a>
          </p>
          <p>
            💬{" "}
            <a href="#" style={{ color: "#93c5fd" }}>
              Chat with Sunny
            </a>
          </p>
          <p style={{ marginTop: "16px" }}>© 2024–2026 SunSweeper, Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
