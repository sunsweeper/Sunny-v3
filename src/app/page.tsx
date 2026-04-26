"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Lightbox } from "../components/chat/Lightbox";
import { ReviewScreenshotsModal } from "../components/reviews/ReviewScreenshotsModal";
import { reviewDropdownLinks, reviewScreenshotPaths } from "../data/reviewLinks";
import { solarImagePaths } from "../data/solarImagePaths";
import { frustrationDelta, shouldOfferHandoff } from "../lib/frustration";
import { detectHumanRequest, detectLeadReason, extractEmail, extractPhone } from "../lib/leadSignals";
import { extractFirstName } from "../lib/nameExtract";
import { ucsContent, universalFollowUps, type UcsServiceKey } from "../lib/ucsContent";
import { logSunny } from "../lib/sunnyLogger";

type UserTextMessage = { role: "user"; type: "text"; content: string; };
type AssistantTextMessage = { role: "assistant"; type: "text"; content: string; imagePaths?: string[]; };
type ChatMessage = UserTextMessage | AssistantTextMessage;

type ServiceKey = "solarPanelCleaning" | "gutterCleaning" | "gutterRepair" | "roofWashing" | "softWashing" | "pressureWashing";
type NavLabel = "New Chat" | "Services" | "SunPass" | "Contact Us";
type StatItem = { value: string; label: string; href?: string; };

const getInitialGreeting = (name: string | null): AssistantTextMessage => ({
  role: "assistant", type: "text",
  content: name ? `Hey ${name}, welcome to SunSweeper.com. How can I help you today?` : "Hey, welcome to SunSweeper.com. How can I help you today?",
});

const SERVICE_TO_UCS_KEY: Record<ServiceKey, UcsServiceKey> = {
  solarPanelCleaning: "solar_panel_cleaning", gutterCleaning: "gutter_cleaning",
  gutterRepair: "gutter_repair_install", roofWashing: "roof_cleaning",
  softWashing: "exterior_cleaning", pressureWashing: "exterior_cleaning",
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "gutterCleaning", label: "Gutter Cleaning" },
  { key: "gutterRepair", label: "Gutter Repair" },
  { key: "roofWashing", label: "Roof Washing" },
  { key: "softWashing", label: "Soft Washing" },
  { key: "pressureWashing", label: "Pressure Washing" },
];

const STAT_ROTATION_MS = 4000;
const STAT_FADE_MS = 500;
const STATS_POOL: StatItem[] = [
  { value: "$8M+", label: "In electricity restored — Projected 2026" },
  { value: "175K+", label: "Solar panels cleaned — Projected 2026" },
  { value: "74", label: "Utility-scale sites served" },
  { value: "23%", label: "Avg. output restored all time" },
  { value: "5★", label: "Customer rating — Yelp & Google ↗", href: "https://www.yelp.com/biz/sun-sweeper-santa-maria?override_cta=Get+pricing" },
];

const NAV_OPENERS: Record<NavLabel, string[]> = {
  "New Chat": ["Welcome back. How can I help you today?", "New conversation started. Need help with services, pricing, or booking?", "How can I help with your property cleaning needs today?"],
  Services: ["I can walk you through each service. Which one are you considering?", "Happy to help. Which service would you like details on?", "We handle solar panels, roofs, gutters, and exterior cleaning. What do you need?"],
  SunPass: ["I can provide a quick SunPass breakdown. Want the details?", "SunPass is designed for consistent maintenance with less hassle. Want details?", "If you\u2019d like, I can summarize SunPass in a few quick points."],
  "Contact Us": ["I can help connect you with the team. What\u2019s the best way to reach you?", "Would you prefer a call, text, or to leave a message here?", "If you\u2019d like, I can collect your information and pass it to a specialist."],
};

const getRandomItem = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const getRandomSolarImages = (count: number): string[] => [...solarImagePaths].sort(() => Math.random() - 0.5).slice(0, count);

const isSolarCleaningQuestion = (value: string): boolean => {
  const n = value.toLowerCase();
  return /(solar|panel|panels|pv)/.test(n) && /(clean|cleaning|dirty|dust|wash|washing|bird droppings|grime|photos|picture|images)/.test(n);
};

const sanitizeKnownName = (value: string | null): string | null => {
  if (!value) return null;
  const first = value.trim().split(/\s+/)[0] ?? "";
  const letters = first.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || letters.length > 20) return null;
  const n = letters.toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const withOptionalName = (followUp: string, knownName: string | null): string =>
  knownName ? followUp.replace(/\?$/, `, ${knownName}?`) : followUp;

// ─────────────────────────────────────────────
// DATE/TIME PICKER MODAL
// ─────────────────────────────────────────────

function formatTime(time: string): string {
  if (!time) return "";
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr ?? "0", 10);
  const minute = minuteStr ?? "00";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function formatDate(date: string): string {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthName = months[parseInt(month ?? "1", 10) - 1] ?? "";
  return `${monthName} ${parseInt(day ?? "1", 10)}, ${year}`;
}

function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

type DateTimeModalProps = { onConfirm: (dateTimeString: string) => void; onDismiss: () => void; };

function DateTimeModal({ onConfirm, onDismiss }: DateTimeModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("09:00");
  const handleConfirm = () => {
    if (!selectedDate) return;
    onConfirm(`${formatDate(selectedDate)} at ${formatTime(selectedTime)}`);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "32px 28px", width: "100%", maxWidth: "380px", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <h2 style={{ color: "#f8fafc", fontSize: "1.2rem", fontWeight: 700, marginBottom: "6px" }}>Pick a date and time</h2>
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "24px" }}>Choose your preferred appointment window.</p>
        <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase" }}>Date</label>
        <input type="date" min={getTodayString()} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: "1rem", marginBottom: "20px", boxSizing: "border-box", outline: "none" }} />
        <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase" }}>Preferred Time</label>
        <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: "1rem", marginBottom: "28px", boxSizing: "border-box", outline: "none" }} />
        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={onDismiss} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={!selectedDate}
            style={{ flex: 2, padding: "12px", borderRadius: "10px", border: "none", background: selectedDate ? "#f59e0b" : "#334155", color: selectedDate ? "#0f172a" : "#64748b", fontSize: "0.95rem", fontWeight: 700, cursor: selectedDate ? "pointer" : "not-allowed", transition: "background 0.2s" }}>
            Confirm Appointment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STREET VIEW MODAL
// ─────────────────────────────────────────────

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

async function checkStreetViewAvailable(address: string): Promise<boolean> {
  if (!MAPS_API_KEY) return false;
  const encoded = encodeURIComponent(address);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${encoded}&key=${MAPS_API_KEY}`);
    const data = await res.json() as { status: string };
    return data.status === "OK";
  } catch { return false; }
}

function buildStreetViewUrl(address: string): string {
  return `https://maps.googleapis.com/maps/api/streetview?size=600x340&location=${encodeURIComponent(address)}&fov=90&pitch=0&key=${MAPS_API_KEY}`;
}

type StreetViewModalProps = { address: string; onConfirm: () => void; onReenter: () => void; };

function StreetViewModal({ address, onConfirm, onReenter }: StreetViewModalProps) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "28px", width: "100%", maxWidth: "640px", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <h2 style={{ color: "#f8fafc", fontSize: "1.15rem", fontWeight: 700, marginBottom: "4px" }}>Does this look like your property?</h2>
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "16px" }}>{address}</p>
        <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid #1e293b", marginBottom: "20px", lineHeight: 0 }}>
          <img src={buildStreetViewUrl(address)} alt="Street view of service address" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={onReenter} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}>Re-enter address</button>
          <button type="button" onClick={onConfirm} style={{ flex: 2, padding: "12px", borderRadius: "10px", border: "none", background: "#f59e0b", color: "#0f172a", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer" }}>Yes, that&apos;s it</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REFERRAL FORM COMPONENT
// ─────────────────────────────────────────────────────────────────

type ReferralFormProps = { onSubmit: (data: { firstName: string; lastName: string; phone: string }) => void; onSkip: () => void; isSubmitting: boolean; };

function ReferralForm({ onSubmit, onSkip, isSubmitting }: ReferralFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const handleSubmit = () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return;
    onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
  };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "10px 12px", color: "#fff", fontSize: "0.9rem", outline: "none", width: "100%", boxSizing: "border-box" };
  const btnBase: React.CSSProperties = { border: "none", borderRadius: "8px", padding: "10px 16px", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", flex: 1 };
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px", padding: "16px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>REFERRAL — optional</p>
      <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
      <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
      <input type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={handleSubmit} disabled={isSubmitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
          style={{ ...btnBase, background: "#f5a623", color: "#0f172a", opacity: (isSubmitting || !firstName.trim() || !lastName.trim() || !phone.trim()) ? 0.5 : 1 }}>
          {isSubmitting ? "Sending..." : "Submit Referral"}
        </button>
        <button type="button" onClick={onSkip} disabled={isSubmitting} style={{ ...btnBase, background: "rgba(255,255,255,0.1)", color: "#fff" }}>Skip</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([getInitialGreeting(null)]);
  const [hasUserEngaged, setHasUserEngaged] = useState(false);
  const [chatState, setChatState] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const [sessionId, setSessionId] = useState("sunny-session-fallback");
  const [knownName, setKnownName] = useState<string | null>(null);
  const [clientFrustrationScore, setClientFrustrationScore] = useState(0);
  const [lastClientHandoffOfferedAt, setLastClientHandoffOfferedAt] = useState<number | null>(null);
  const [clientHandoffActive] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [streetViewAddress, setStreetViewAddress] = useState<string | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);
  const [lightboxImagePath, setLightboxImagePath] = useState<string | null>(null);
  const [isServicesDropdownOpen, setIsServicesDropdownOpen] = useState(false);
  const [isReviewScreenshotsOpen, setIsReviewScreenshotsOpen] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [isReferralSubmitting, setIsReferralSubmitting] = useState(false);
  const [visibleStatIndexes, setVisibleStatIndexes] = useState<number[]>([0, 1, 2, 3]);
  const [fadeSlot, setFadeSlot] = useState<number | null>(null);
  const rotationStepRef = useRef(0);
  const chatShellRef = useRef<HTMLElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem("sunny_session_id");
    if (existing) { setSessionId(existing); } else {
      const generated = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sunny-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem("sunny_session_id", generated);
      setSessionId(generated);
    }
    const storedName = sanitizeKnownName(window.localStorage.getItem("sunny_known_name"));
    const hasVisited = window.localStorage.getItem("sunny_has_visited") === "true";
    setShowOnboardingModal(!hasVisited);
    setKnownName(storedName);
    setMessages((prev) => { if (prev.length !== 1 || prev[0]?.role !== "assistant") return prev; return [getInitialGreeting(storedName)]; });
  }, []);

  // Show date/time modal when Sunny asks for it
  useEffect(() => {
    if (chatState.lastAskedField === "preferred date and time" && !isLoading) setShowDateTimeModal(true);
  }, [chatState.lastAskedField, isLoading]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const step = rotationStepRef.current;
      const slot = step % 4;
      const incomingIndex = (step + 4) % STATS_POOL.length;
      setFadeSlot(slot);
      window.setTimeout(() => {
        setVisibleStatIndexes((prev) => {
          const next = [...prev];
          next[slot] = incomingIndex;
          return next;
        });
        setFadeSlot(null);
      }, STAT_FADE_MS);
      rotationStepRef.current += 1;
    }, STAT_ROTATION_MS);
    return () => window.clearInterval(interval);
  }, []);

  // Show Street View modal when address is collected
  useEffect(() => {
    const address = chatState.quoteAddress as string | undefined;
    if (address && address !== pendingAddress && !isLoading && MAPS_API_KEY) {
      setPendingAddress(address);
      void checkStreetViewAvailable(address).then((available) => { if (available) setStreetViewAddress(address); });
    }
  }, [chatState.quoteAddress, isLoading, pendingAddress]);

  const handleStartChat = () => { window.localStorage.setItem("sunny_has_visited", "true"); setShowOnboardingModal(false); };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const messagesContainer = messagesRef.current;
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return;
      }
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, showReferralForm]);

  // ─────────────────────────────────────────────
  // CORE SEND FUNCTION
  // ─────────────────────────────────────────────

  const sendMessage = async (text: string, overrideState?: Record<string, unknown>) => {
    if (!text.trim() || isLoading) return;
    if (!hasUserEngaged) setHasUserEngaged(true);

    const userMessage: UserTextMessage = { role: "user", type: "text", content: text.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const extractedEmail = extractEmail(text);
    const extractedPhone = extractPhone(text);
    const extractedName = extractFirstName(text);
    if (extractedName) { window.localStorage.setItem("sunny_known_name", extractedName); setKnownName(extractedName); }
    if (extractedEmail) window.localStorage.setItem("sunny_known_email", extractedEmail);
    if (extractedPhone) window.localStorage.setItem("sunny_known_phone", extractedPhone);

    const email = window.localStorage.getItem("sunny_known_email") || "";
    const phone = window.localStorage.getItem("sunny_known_phone") || "";
    const { lead_detected, lead_reason } = detectLeadReason(text);

    const now = Date.now();
    const nextFrustrationScore = Math.max(0, clientFrustrationScore - 1) + frustrationDelta(text);
    const frustrationTriggered = shouldOfferHandoff({ frustrationScore: nextFrustrationScore, handoffActive: clientHandoffActive, lastHandoffOfferedAt: lastClientHandoffOfferedAt, now });
    setClientFrustrationScore(nextFrustrationScore);
    if (frustrationTriggered) setLastClientHandoffOfferedAt(now);

    logSunny({ role: "user", type: "message", text: text.trim(), lead_detected, lead_reason, phone, email, handoff_requested: frustrationTriggered || detectHumanRequest(text) || lead_detected });

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), state: overrideState ?? chatState, messages: nextMessages, sessionId }),
      });

      const data = (await response.json()) as { reply?: string; state?: Record<string, unknown>; };
      const reply = data.reply?.trim() || "I'm sorry\u2014something went wrong while responding.";

      const imageUrls = isSolarCleaningQuestion(text) ? getRandomSolarImages(2) : [];
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply, imagePaths: imageUrls.length > 0 ? imageUrls : undefined }]);
      logSunny({ role: "assistant", type: "message", text: reply, lead_detected: false, lead_reason: "", handoff_requested: false });

      if (data.state) {
        setChatState(data.state);
        if (data.state.awaitingReferral === true && !data.state.referralSubmitted) setShowReferralForm(true);
      }
    } catch (error) {
      console.error("Chat fetch error:", error);
      const fallbackReply = "I'm having trouble right now. Please try again in a moment.";
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: fallbackReply }]);
      logSunny({ role: "assistant", type: "message", text: fallbackReply, lead_detected: false, lead_reason: "", handoff_requested: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => { await sendMessage(input); };
  const handleDateTimeConfirm = async (dateTimeString: string) => { setShowDateTimeModal(false); await sendMessage(dateTimeString); };
  const handleStreetViewConfirm = () => { setStreetViewAddress(null); };
  const handleStreetViewReenter = async () => {
    setStreetViewAddress(null);
    setPendingAddress(null);
    setChatState((prev) => ({ ...prev, quoteAddress: undefined, address: undefined, lastAskedField: "quoteAddress" }));
    await sendMessage("I need to correct my address");
  };

  // ─────────────────────────────────────────────
  // REFERRAL HANDLERS
  // ─────────────────────────────────────────────

  const handleReferralSubmit = async (data: { firstName: string; lastName: string; phone: string }) => {
    setIsReferralSubmitting(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "", state: chatState, messages, sessionId, referralData: data }),
      });
      const result = (await response.json()) as { reply?: string; state?: Record<string, unknown>; };
      const reply = result.reply?.trim() || "Referral noted \u2014 thank you!";
      setShowReferralForm(false);
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply }]);
      if (result.state) setChatState(result.state);
    } catch {
      setShowReferralForm(false);
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "Referral noted \u2014 thank you! Let me pull up your booking summary." }]);
    } finally { setIsReferralSubmitting(false); }
  };

  const handleReferralSkip = async () => {
    setShowReferralForm(false);
    setIsLoading(true);
    try {
      const skippedState = { ...chatState, referralSubmitted: true, awaitingReferral: false };
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "show booking summary", state: skippedState, messages, sessionId }),
      });
      const data = (await response.json()) as { reply?: string; state?: Record<string, unknown>; };
      const reply = data.reply?.trim() || "No problem \u2014 here is your booking summary.";
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply }]);
      if (data.state) setChatState(data.state);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "No problem \u2014 let me pull up your booking summary." }]);
    } finally { setIsLoading(false); }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); }
  };

  const handleServiceClick = (service: ServiceKey) => {
    const ucsKey = SERVICE_TO_UCS_KEY[service];
    const serviceLine = getRandomItem(ucsContent[ucsKey]);
    const lastAssistantMessage = [...messages].reverse().find((m): m is Extract<ChatMessage, { role: "assistant"; type: "text" }> => m.role === "assistant" && m.type === "text")?.content ?? "";
    let universalFollowUp = getRandomItem(universalFollowUps);
    let attempts = 0;
    while (lastAssistantMessage.endsWith(withOptionalName(universalFollowUp, knownName)) && attempts < 4) { universalFollowUp = getRandomItem(universalFollowUps); attempts += 1; }
    const ucsMessage = `${serviceLine}\n\n${withOptionalName(universalFollowUp, knownName)}`;
    const imageUrls = service === "solarPanelCleaning" ? getRandomSolarImages(2) : [];
    const serviceIntroMessage: AssistantTextMessage = { role: "assistant", type: "text", content: ucsMessage, imagePaths: imageUrls.length > 0 ? imageUrls : undefined };
    setActiveService(service);
    if (!hasUserEngaged) { setMessages([serviceIntroMessage]); } else { setMessages((prev) => [...prev, serviceIntroMessage]); }
    logSunny({ role: "assistant", type: "ucs", service_key: ucsKey, text: ucsMessage, lead_detected: false, lead_reason: "", handoff_requested: false });
    setChatState((prev) => ({ ...prev, selectedService: service }));
    chatShellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleNavClick = (label: NavLabel) => {
    const opener = getRandomItem(NAV_OPENERS[label]);
    const navMessage: AssistantTextMessage = { role: "assistant", type: "text", content: opener };
    if (label === "New Chat") {
      setMessages([navMessage]); setChatState({}); setActiveService(null); setHasUserEngaged(false);
      setShowReferralForm(false); setStreetViewAddress(null); setPendingAddress(null);
    } else if (label === "SunPass") {
      if (!hasUserEngaged) { setMessages([navMessage]); } else { setMessages((prev) => [...prev, navMessage]); }
      setChatState((prev) => ({ ...prev, activeConversationState: "sunpass_intro" }));
    } else if (!hasUserEngaged) { setMessages([navMessage]); } else { setMessages((prev) => [...prev, navMessage]); }
    logSunny({ role: "assistant", type: "message", text: opener, lead_detected: false, lead_reason: "", handoff_requested: false });
    chatShellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="page-shell">
      <div className="page-background" />
      <header className="top-nav">
        <div className="top-nav-left">
          <button type="button" className="new-chat-btn" onClick={() => handleNavClick("New Chat")}>+ New Chat</button>
        </div>
        <nav className="top-nav-center" aria-label="Site navigation">
          <button type="button" className="service-link" onClick={() => setIsServicesDropdownOpen((prev) => !prev)}>Services</button>
          <button type="button" className="service-link" onClick={() => handleNavClick("SunPass")}>SunPass</button>
          <button type="button" className="service-link" onClick={() => handleNavClick("Contact Us")}>Contact</button>
          <a className="service-link" href={reviewDropdownLinks[3]?.href ?? "https://www.yelp.com"} target="_blank" rel="noreferrer">Reviews</a>
          {isServicesDropdownOpen && (
            <div className="service-dropdown-menu" role="menu" aria-label="Service menu">
              {SERVICE_OPTIONS.map((service) => (
                <button key={service.key} type="button" role="menuitem" className={`service-dropdown-item ${activeService === service.key ? "active" : ""}`}
                  onClick={() => { handleServiceClick(service.key); setIsServicesDropdownOpen(false); }}>{service.label}</button>
              ))}
            </div>
          )}
        </nav>
        <div className="top-nav-right">
          <a className="phone" href="tel:8059381515" aria-label="Call SunSweeper at 805-938-1515">805-938-1515</a>
          <p className="contact-line">Call or Text a Live Human</p>
        </div>
      </header>

      <section className="home-layout" style={{ height: "100vh", overflow: "hidden" }}>
        <aside className="brand-panel" style={{ height: "100%", overflowY: "auto" }}>
          <Image src="/logo.png" alt="SunSweeper logo" width={120} height={65} className="hero-logo" priority />
          <p className="hero-kicker">SUNSWEEPER PREMIUM SERVICE</p>
          <h1 className="headline">The Solar Panel and Roof Cleaning Experts.</h1>
          <p className="hero-subtext">Protecting your investment. Maximizing your output.</p>

          <div className="stats-grid">
            {visibleStatIndexes.map((statIndex, slot) => {
              const stat = STATS_POOL[statIndex];
              const content = (
                <>
                  <p className="stat-value">{stat.value}</p>
                  <p className="stat-label">{stat.label}</p>
                </>
              );
              return stat.href ? (
                <a key={`${stat.value}-${slot}`} href={stat.href} target="_blank" rel="noreferrer" className={`stat-tile ${fadeSlot === slot ? "fade" : ""}`}>{content}</a>
              ) : (
                <div key={`${stat.value}-${slot}`} className={`stat-tile ${fadeSlot === slot ? "fade" : ""}`}>{content}</div>
              );
            })}
          </div>

          <div className="left-list">
            <p className="left-label">Services</p>
            <ul>
              {SERVICE_OPTIONS.map((service) => (
                <li key={service.key}>{service.label}</li>
              ))}
            </ul>
          </div>

          <div className="left-list">
            <p className="left-label">Service Area Cities</p>
            <p className="city-copy">Santa Maria • Orcutt • Nipomo • Arroyo Grande • Pismo Beach • San Luis Obispo • Paso Robles • Cambria</p>
          </div>
        </aside>

        <section ref={chatShellRef} className="chat-column" style={{ height: "100%", overflow: "hidden" }}>
          <section className="chat-shell">
          <div className="chat-header">
            <div className="chat-header-left">
              <span className="online-dot" aria-hidden="true" />
              <span className="chat-title">Sunny</span>
            </div>
          </div>
          <div ref={messagesRef} className="messages">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const isLastAssistant = !isUser && index === messages.length - 1;
              const quickReplies =
                isLastAssistant && !isUser && Array.isArray(chatState.sunpassQuickReplies)
                  ? (chatState.sunpassQuickReplies as string[])
                  : [];
              return (
                <div key={`${message.role}-${index}`} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                  <div className={`bubble ${isUser ? "user-bubble" : "assistant-bubble"}`}>
                    {message.content.split("\n").map((line, i) => (
                      <p key={i} style={{ margin: line.trim() ? "0.35em 0" : "0.8em 0" }}>{line}</p>
                    ))}
                    {quickReplies.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                        {quickReplies.map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={isLoading}
                            onClick={() => void sendMessage(option)}
                            style={{
                              borderRadius: "999px",
                              border: "1px solid rgba(255,255,255,0.35)",
                              background: "rgba(245,166,35,0.18)",
                              color: "#fff",
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              cursor: isLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                    {isLastAssistant && showReferralForm && (
                      <ReferralForm onSubmit={handleReferralSubmit} onSkip={handleReferralSkip} isSubmitting={isReferralSubmitting} />
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && <div className="msg-row assistant"><div><p className="typing">Sunny is thinking...</p></div></div>}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
          <div className="input-wrap">
            <textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Ask me anything..." className="chat-input" />
            <button type="button" onClick={() => void handleSend()} disabled={isLoading || !input.trim()} className="send-btn" aria-label="Send message to Sunny">
              <span aria-hidden="true">&#x27A4;</span>
              <span className="send-label" style={{ fontWeight: 800, color: "#fff" }}>Send</span>
            </button>
          </div>
          <p className="helper-text">
            Not getting what you need from Sunny? Ask to speak with a live person and Sunny will take a message and get it to a specialist.
          </p>
          </section>
        </section>
      </section>

      {showOnboardingModal && (
        <div className="sunny-onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Sunny">
          <div className="sunny-onboarding-modal">
            <p>
              Welcome to SunSweeper.com.<br />
              We&apos;re the solar panel and roof cleaning experts.<br /><br />
              If this is your first time here, this site works differently than most.<br /><br />
              The entire site runs through our Customer Service Lead, Sunny.<br /><br />
              Sunny is a wicked fast typist, available 24/7, doesn&apos;t need coffee, and has an unhealthy obsession with clean panels and straight answers.<br /><br />
              Want to learn about our services? Ask Sunny.<br />
              Want to see photos of past work? Ask Sunny.<br />
              Want to book a solar panel cleaning for the 25 panels on your second-story barn roof? Sunny can handle that too.<br /><br />
              Ready to give Sunny a try?
            </p>
            <div className="sunny-onboarding-actions">
              <button type="button" className="sunny-onboarding-btn sunny-onboarding-btn-gold" onClick={handleStartChat}>Yes</button>
              <button type="button" className="sunny-onboarding-btn sunny-onboarding-btn-dark" onClick={handleStartChat}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {showDateTimeModal && (
        <DateTimeModal onConfirm={(dateTimeString) => { void handleDateTimeConfirm(dateTimeString); }} onDismiss={() => setShowDateTimeModal(false)} />
      )}

      {streetViewAddress && (
        <StreetViewModal address={streetViewAddress} onConfirm={handleStreetViewConfirm} onReenter={() => { void handleStreetViewReenter(); }} />
      )}

      <Lightbox imagePath={lightboxImagePath} onClose={() => setLightboxImagePath(null)} />
      <ReviewScreenshotsModal isOpen={isReviewScreenshotsOpen} imagePaths={reviewScreenshotPaths} onClose={() => setIsReviewScreenshotsOpen(false)}
        onImageClick={(path) => { setLightboxImagePath(path); setIsReviewScreenshotsOpen(false); }} />
    </main>
  );
}
