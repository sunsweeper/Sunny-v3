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
    <main className="min-h-screen bg-[#163B5B] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 pb-12 pt-10 sm:px-8">
        <header className="rounded-2xl border border-white/10 bg-[#0f2f4a] px-6 py-8 shadow-[0_20px_50px_rgba(5,15,30,0.35)]">
          <div className="flex flex-col items-center gap-8 text-center lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:text-left">
            <div className="space-y-3 lg:pr-6">
              <p className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
                The Solar Panel and roof cleaning experts.
              </p>
              <p className="text-sm text-slate-200/80">
                Relaxed, friendly, and here to help.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div className="h-24 w-24 overflow-hidden rounded-full bg-white/10 p-2 shadow-[0_0_30px_rgba(255,255,255,0.15)] sm:h-28 sm:w-28">
                <Image
                  src="/logo.png"
                  alt="SunSweeper logo"
                  width={112}
                  height={112}
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
            <div className="space-y-2 text-center lg:pl-6 lg:text-right">
              <p className="text-2xl font-semibold text-white">
                805-938-1515
              </p>
              <p className="text-sm text-slate-200/80">
                Call or text for a live human
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6">
          <div className="flex-1 rounded-3xl border border-white/20 bg-[#2F7DBA] p-6 shadow-[0_28px_60px_rgba(7,19,41,0.5)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/20 bg-[#3A8BC7] px-5 py-4 sm:flex-row sm:items-center">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/40 bg-white/10">
                  <Image
                    src="/sunny-avatar.jpg"
                    alt="Sunny avatar"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-sm text-white/90">
                  Sunny follows your lead — ask anything or dive into services
                  when you&apos;re ready.
                </p>
              </div>

              <div className="space-y-4">
                {!hasMessages && (
                  <p className="text-sm text-slate-100/80">
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
                          isUser ? "" : ""
                        }`}
                      >
                        {!isUser && (
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/30 bg-white/10">
                            <Image
                              src="/sunny-avatar.jpg"
                              alt="Sunny avatar"
                              width={40}
                              height={40}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        {isUser && (
                          <div className="rounded-md bg-[#15496e] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/90">
                            You
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-[0_10px_25px_rgba(7,18,36,0.3)] ${
                            isUser ? "bg-[#1E5F90] text-white" : "bg-[#3A8BC7] text-white"
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
                    <div className="flex items-center gap-3 rounded-2xl bg-[#3A8BC7] px-4 py-3 text-sm text-slate-100">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/30 bg-white/10">
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
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                            style={{ animationDelay: "300ms" }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-[#2F7DBA] p-4 shadow-[0_16px_35px_rgba(7,19,41,0.4)]">
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
                className="min-h-[52px] flex-1 resize-none rounded-full border border-white/30 bg-[#143c5e] px-6 py-3 text-sm text-white placeholder:text-slate-200/70 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isLoading || !input.trim()}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1E5F90] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/60"
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
          </div>
        </div>
      </section>
    </main>
  );
}
