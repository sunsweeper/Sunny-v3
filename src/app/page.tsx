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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.25),_transparent_55%),linear-gradient(135deg,_#0f172a_0%,_#020617_45%,_#1e293b_100%)]" />
      <div className="pointer-events-none absolute left-[-10%] top-[-20%] h-[420px] w-[420px] rounded-full bg-amber-400/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[520px] w-[520px] rounded-full bg-sky-500/20 blur-[140px]" />

      <header className="relative z-10 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
              SunSweeper
            </p>
            <h1 className="text-2xl font-semibold">Sunny Assistant</h1>
            <p className="text-sm text-white/60">
              Chill solar vibes, helpful answers.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            Online
          </span>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex-1 space-y-5 overflow-y-auto rounded-3xl border border-white/10 bg-black/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          {!hasMessages && (
            <p className="text-sm text-white/60">
              Say hi, ask a random question, or dive into cleaning help whenever you want.
            </p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex items-end gap-3 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && (
                  <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/20">
                    <Image
                      src="/sunny-avatar.png"
                      alt="Sunny the Silkie chicken"
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                    isUser
                      ? "bg-teal-600 text-white"
                      : "bg-emerald-700 text-white"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-full border border-white/20">
                <Image
                  src="/sunny-avatar.png"
                  alt="Sunny the Silkie chicken"
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/80">
                <span>Sunny is thinking</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/70 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur">
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
              placeholder="Say hi, ask anything, or talk solar..."
              className="min-h-[52px] flex-1 resize-none rounded-full border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm text-white placeholder:text-white/40 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-amber-400 text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-400/40"
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="currentColor"
              >
                <path d="M3.4 20.6a1 1 0 0 1-1.2-1.2l2.2-7.4L2.2 4.6A1 1 0 0 1 3.4 3.4l18 7a1 1 0 0 1 0 1.9l-18 7Z" />
              </svg>
            </button>
          </div>
          <p className="mt-3 text-xs text-white/50">
            Sunny follows your lead—chat casually or ask about cleanings when you’re ready.
          </p>
        </div>
      </section>
    </main>
  );
}
