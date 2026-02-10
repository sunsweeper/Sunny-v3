"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Hey there! I’m Sunny, the SunSweeper AI. I’m here to make things easy—pricing, scheduling, service details, and clear answers about what we do and how we do it. No digging, no guessing. Just ask.",
};

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [currentState, setCurrentState] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
    </main>
  );
}
