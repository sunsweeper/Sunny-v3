"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I’m Sunny, the SunSweeper assistant. How can I help with services or a quote today?",
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
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
              SunSweeper
            </p>
            <h1 className="text-xl font-semibold">Sunny Assistant</h1>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Online
          </span>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!hasMessages && (
            <p className="text-sm text-slate-500">
              Start the conversation by asking about services, pricing, or booking.
            </p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-emerald-50 text-slate-900"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
                Sunny is typing...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="sr-only" htmlFor="chat-input">
              Message Sunny
            </label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ask Sunny about services, pricing, or scheduling..."
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
            >
              Send
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sunny can help with quotes, booking details, and service questions.
          </p>
        </div>
      </section>
    </main>
  );
}
