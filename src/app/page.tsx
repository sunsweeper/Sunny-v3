"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
    "Got it—you’re looking at solar panel cleaning. I can walk you through how dirt actually affects output on the Central Coast, what we see most often up there, and whether cleaning makes sense right now or later. Where would you like to start?",
    "Solar panels don’t lose efficiency dramatically—they lose it quietly. I can help you figure out if that’s happening on your roof and what a proper cleaning actually involves. Want details, pricing, or both?",
    "You’re in the right place. I can explain how we clean panels safely (and what we don’t do), how often systems like yours usually need it, and what kind of results people typically see. What’s most useful to you?",
    "Panels look clean long before they are clean. If you want clarity on condition, timing, or cost—ask away. I’ll tailor this to your system and location.",
  ],
  birdProofing: [
    "Ah—bird proofing. Where the real issue isn’t nature, it’s organized avian crime. I can explain what’s happening under your panels, why birds keep choosing the same spots, and how we shut it down—humanely and permanently. What are you seeing?",
    "You’re not imagining it: birds treat solar panels like luxury condos… and occasionally like battlegrounds. I can break down the damage, the noise, the mess, and how we stop the cycle without harming the birds. Want the short version or the deep dive?",
    "Bird proofing isn’t about “a few nests.” It’s about turf wars, repeat offenders, and pigeons who absolutely remember addresses. I can explain the risks and the fix—what would you like to know first?",
    "Under-panel bird activity is basically bird-on-bird crime with a homeowner caught in the middle. If you want to know how we evict, reinforce, and keep peace on your roof—let’s talk details.",
  ],
  roofWashing: [
    "Roof washing is one of those things people wait on until they have to deal with it. I can explain what we clean, what we never pressure, and when it’s cosmetic versus necessary. What’s going on with your roof?",
    "Different roofs need very different care. I can help you understand what’s safe for yours, what actually removes growth, and what helps with insurance or curb appeal concerns. Where should we start?",
    "A clean roof isn’t just about looks—it’s about longevity. I can walk you through the process, pricing, and whether now is the right time or if waiting makes sense. Your call.",
    "Roofs don’t give warning lights, unfortunately. If you want clarity on condition, cleaning options, or next steps, I’m here to help—no pressure, just straight answers.",
  ],
  gutterCleaningRepair: [
    "Gutters are quiet until they’re not. I can help you figure out whether you’re due for a clean, dealing with a blockage, or looking at a small repair. What made you click?",
    "Overflow, sagging, or just peace of mind? I can explain what we check, what usually causes problems, and how to prevent repeat issues. Where would you like to start?",
    "Gutter problems almost always show up after the damage starts. I can help you get ahead of it—or fix what’s already happening. What’s the situation?",
    "Cleaning, repairs, or just a sanity check—gutters are one of those systems that work best when you forget about them. I can help you do exactly that.",
  ],
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "birdProofing", label: "Bird Proofing" },
  { key: "roofWashing", label: "Roof Wash" },
  { key: "gutterCleaningRepair", label: "Gutter Cleaning/Repair" },
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

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement) {
      return;
    }

    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: "smooth",
    });
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
      console.log("Sending state:", chatState);
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

      const reply =
        data.reply?.trim() ||
        "I’m sorry—something went wrong while responding.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (data.state) {
        setChatState(data.state);
      }
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
    setChatState((prev) => ({ ...prev, selectedService: service }));
    chatShellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="headline">The solar panel and roof cleaning experts.</p>
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
            <p className="helper-text">Say hi, ask a question, or talk shop when you&apos;re ready.</p>
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
