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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-[#0a1d3a] via-[#071329] to-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,214,102,0.15),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(17,36,74,0.8),_transparent_60%)]" />
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 pb-10 pt-8 sm:px-6">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-300/20 text-3xl shadow-[0_0_30px_rgba(253,224,71,0.35)]">
                ☀️
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">
                  SunSweeper
                </p>
                <p className="text-sm text-amber-100/90">
                  The Solar Panel and roof cleaning experts
                </p>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Sunny Assistant
              </h1>
              <p className="mt-2 text-sm text-slate-200/80">
                Relaxed, friendly, and here to help.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-amber-300/40 bg-amber-300/15 px-5 py-3 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(253,224,71,0.15)]">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(253,224,71,0.7)]" />
            <span className="text-amber-100">805-938-1515 Call or text for a live human</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/70 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.45)] backdrop-blur">
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
                  <div
                    className={`flex max-w-[85%] items-end gap-3 ${
                      isUser ? "flex-row-reverse" : ""
                    }`}
                  >
                    {!isUser && (
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                        <Image
                          src="/sunny-avatar.jpg"
                          alt="Sunny avatar"
                          width={40}
                          height={40}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                        isUser
                          ? "bg-amber-600 text-white"
                          : "bg-gray-800 text-white"
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
                <div className="flex items-center gap-3 rounded-2xl bg-gray-800/90 px-4 py-3 text-sm text-slate-200">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                    <Image
                      src="/sunny-avatar.jpg"
                      alt="Sunny avatar"
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Sunny is responding...</span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300" />
                      <span
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.4)] backdrop-blur">
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
                className="min-h-[52px] flex-1 resize-none rounded-full border border-white/10 bg-[#09172d] px-6 py-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200/40"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isLoading || !input.trim()}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-[#0a1d3a] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-400/50"
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
              Sunny follows your lead — ask anything or dive into services when
              you&apos;re ready.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
