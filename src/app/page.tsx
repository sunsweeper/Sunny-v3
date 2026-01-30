"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Hey there! I'm Sunny ☀️ — how's it going? Ask me anything!",
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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1d3a] via-[#13284d] to-[#d1a23a] opacity-90" />
        <div className="absolute inset-0 bg-[url('/sunny-background.png')] bg-cover bg-center opacity-60" />
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-lg font-semibold">
              ☀️
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                SunSweeper
              </p>
              <h1 className="text-xl font-semibold text-white">Sunny Assistant</h1>
              <p className="text-sm text-slate-200/80">Relaxed, friendly, and here to help.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Online
          </span>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          {!hasMessages && (
            <p className="text-sm text-slate-300/80">
              Say hi, ask a question, or talk shop when you&apos;re ready.
            </p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex max-w-[85%] items-end gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                  {!isUser && (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                      <Image
                        src="/sunny-avatar.png"
                        alt="Sunny avatar"
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                      isUser ? "bg-teal-600 text-white" : "bg-green-700 text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-200">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                  <Image
                    src="/sunny-avatar.png"
                    alt="Sunny avatar"
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span>Sunny is thinking</span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300" />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.25)] backdrop-blur">
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
              placeholder="Type a message or just say hi..."
              className="min-h-[52px] flex-1 resize-none rounded-full border border-gray-700 bg-gray-900 px-5 py-3 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800"
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-300/80">
            Sunny follows your lead — ask anything or dive into services when you&apos;re ready.
          </p>
        </div>
      </section>
    </main>
  );
}
