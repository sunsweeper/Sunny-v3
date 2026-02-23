"use client";

import * as React from "react";

export type ChatRole = "assistant" | "user" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  messages: ChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  placeholder?: string;
};

export default function GlassChatWindow({
  title = "Sunny",
  subtitle = "Solar clarity for homeowners",
  messages,
  input,
  onInputChange,
  onSend,
  isLoading = false,
  placeholder = "Enter message…",
}: Props) {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Auto-scroll to bottom when messages change
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) onSend();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative rounded-3xl p-[1px] overflow-hidden">
        {/* Outer glow frame */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-amber-400/35 via-white/10 to-sky-400/25 blur-xl" />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/12 via-white/6 to-white/10" />

        {/* Glass body */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 55%, rgba(255,255,255,0.08) 100%)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-5"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-white text-2xl font-semibold tracking-tight">{title}</div>
                <div className="text-white/70 text-sm">{subtitle}</div>
              </div>

              {/* Optional “status dot” */}
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-300/35 blur-[2px]" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300/75" />
                </span>
                <span>Online</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="px-6 py-6 space-y-4 max-h-[420px] overflow-y-auto"
          >
            {messages.length === 0 ? (
              <div className="text-white/70">
                Hi — what can Sunny help you with today?
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="relative max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed"
                      style={{
                        color: "rgba(255,255,255,0.92)",
                        background: isUser
                          ? "linear-gradient(180deg, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0.10) 100%)"
                          : "linear-gradient(180deg, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.08) 100%)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        boxShadow: isUser
                          ? "0 10px 30px rgba(0,0,0,0.25)"
                          : "0 10px 30px rgba(0,0,0,0.22)",
                      }}
                    >
                      {/* Edge glow identity (Option 3) */}
                      <span
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                        style={{
                          background: isUser
                            ? "linear-gradient(180deg, rgba(56,189,248,0.95) 0%, rgba(56,189,248,0.35) 100%)"
                            : "linear-gradient(180deg, rgba(251,191,36,0.95) 0%, rgba(251,191,36,0.35) 100%)",
                          boxShadow: isUser
                            ? "0 0 14px rgba(56,189,248,0.55)"
                            : "0 0 14px rgba(251,191,36,0.55)",
                        }}
                      />
                      <div className="pl-2 whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing / thinking indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="relative rounded-2xl px-4 py-3 text-white/80"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.06) 100%)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(251,191,36,0.95) 0%, rgba(251,191,36,0.35) 100%)",
                      boxShadow: "0 0 14px rgba(251,191,36,0.55)",
                    }}
                  />
                  <div className="pl-2 flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse" />
                    <span className="inline-block h-2 w-2 rounded-full bg-white/50 animate-pulse" />
                    <span className="inline-block h-2 w-2 rounded-full bg-white/40 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input row */}
          <div
            className="px-6 py-5"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.14)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <input
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="flex-1 rounded-2xl px-4 py-3 bg-white/10 text-white placeholder:text-white/45 outline-none"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                }}
              />

              <button
                onClick={() => {
                  if (!isLoading && input.trim()) onSend();
                }}
                disabled={isLoading || !input.trim()}
                className="rounded-2xl px-5 py-3 font-semibold text-[#1b1200] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(251,191,36,1) 0%, rgba(245,158,11,1) 100%)",
                  boxShadow:
                    "0 12px 30px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
                }}
              >
                Send
              </button>
            </div>

            <div className="mt-3 text-center text-white/55 text-xs">
              Sunny can estimate and schedule. For unusual jobs, we confirm details.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
