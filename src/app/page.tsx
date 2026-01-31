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
    <main className="min-h-screen bg-[#1F3F5B] text-white">
      <section className="w-full">
        <header className="w-full bg-[#1F3F5B] py-10">
          <div className="mx-auto flex flex-col items-center gap-8 px-4 text-center sm:px-8 lg:grid lg:max-w-6xl lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:text-left">
            <div className="space-y-3 lg:pr-8">
              <p className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-[2.6rem]">
                The Solar Panel and roof cleaning experts.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-[#F5B301] bg-[#1F3F5B] p-2 sm:h-32 sm:w-32">
                <Image
                  src="/logo.png"
                  alt="SunSweeper logo"
                  width={128}
                  height={128}
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
            <div className="space-y-2 text-center lg:pl-8 lg:text-right">
              <p className="text-3xl font-semibold tracking-wide text-white sm:text-4xl">
                805-938-1515
              </p>
              <p className="text-base text-white">
                Call or text for a live human
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-6 px-4 pb-12 sm:px-8">
          <div className="w-full rounded-2xl border border-[#1E5F90] bg-[#2F7DBA] p-6 shadow-[0_18px_40px_rgba(30,95,144,0.35)] sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#1E5F90] bg-[#3F8FCC]">
                  <Image
                    src="/sunny-avatar.jpg"
                    alt="Sunny avatar"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-lg leading-relaxed text-[#0A1A26]">
                  Sunny follows your lead — ask anything or dive into services
                  when you&apos;re ready.
                </p>
              </div>

              <div className="space-y-4">
                {!hasMessages && (
                  <p className="text-sm text-[#0A1A26]">
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
                      <div className="flex max-w-[85%] items-start gap-3">
                        {!isUser && (
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#1E5F90] bg-[#3F8FCC]">
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
                          <div className="rounded-md bg-[#1F3F5B] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#F5B301]">
                            You
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-[0_10px_20px_rgba(30,95,144,0.25)] ${
                            isUser
                              ? "bg-[#1E5F90] text-white"
                              : "bg-[#3F8FCC] text-[#0A1A26]"
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
                    <div className="flex items-center gap-3 rounded-2xl bg-[#3F8FCC] px-4 py-3 text-sm text-[#0A1A26]">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#1E5F90] bg-[#3F8FCC]">
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
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A1A26]" />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A1A26]"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A1A26]"
                            style={{ animationDelay: "300ms" }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              <div className="rounded-xl border border-[#1F3F5B] bg-[#2F7DBA] p-4">
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
                    placeholder="Enter text here."
                    className="min-h-[52px] flex-1 resize-none rounded-md border border-[#1F3F5B] bg-[#E6E6E6] px-4 py-2 text-sm text-[#0A1A26] placeholder:text-[#6B6B6B] focus:border-[#1F3F5B] focus:outline-none focus:ring-2 focus:ring-[#1F3F5B]/40"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isLoading || !input.trim()}
                    className="inline-flex h-11 items-center justify-center rounded-md bg-[#1E5F90] px-5 text-sm font-semibold text-white transition hover:bg-[#1F3F5B] disabled:cursor-not-allowed disabled:bg-[#1E5F90]/60"
                    aria-label="Send message"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
