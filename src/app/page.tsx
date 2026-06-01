"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChatImageBubble } from "../components/chat/ChatImageBubble";
import { Lightbox } from "../components/chat/Lightbox";
import { ReviewScreenshotsModal } from "../components/reviews/ReviewScreenshotsModal";
import { SolarPhotoStrip } from "../components/solar/SolarPhotoStrip";
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

type ServiceKey = "solarPanelCleaning" | "gutterCleaning" | "gutterRepair" | "roofWashing" | "softWashing" | "pressureWashing" | "birdProofing";
type NavLabel = "New Chat" | "Services" | "SunPass" | "Contact Us";
type StatItem = { value: string; label: string; href?: string; };
type WeatherDisplay = { city: string; temperature: string; icon: string; };

const getInitialGreeting = (): AssistantTextMessage => ({
  role: "assistant", type: "text",
  content: "Hey! Welcome to SunSweeper.com. How can I help you today?",
});

const SERVICE_TO_UCS_KEY: Record<ServiceKey, UcsServiceKey> = {
  solarPanelCleaning: "solar_panel_cleaning", gutterCleaning: "gutter_cleaning",
  gutterRepair: "gutter_repair_install", roofWashing: "roof_cleaning",
  softWashing: "exterior_cleaning", pressureWashing: "exterior_cleaning",
  birdProofing: "solar_panel_cleaning",
};

const SERVICE_OPTIONS: Array<{ key: ServiceKey; label: string }> = [
  { key: "solarPanelCleaning", label: "Solar Panel Cleaning" },
  { key: "birdProofing", label: "Solar Bird Proofing" },
  { key: "gutterCleaning", label: "Gutter Cleaning" },
  { key: "gutterRepair", label: "Gutter Repair" },
  { key: "roofWashing", label: "Roof Washing" },
  { key: "softWashing", label: "Soft Washing" },
  { key: "pressureWashing", label: "Pressure Washing" },
];

const STAT_ROTATION_MS = 4000;
const STAT_FADE_MS = 500;
const STATS_POOL: StatItem[] = [
  { value: "$12M+", label: "In electricity restored — Projected 2026" },
  { value: "245K+", label: "Solar panels cleaned — Projected 2026" },
  { value: "89", label: "Utility-scale sites served" },
  { value: "23%", label: "Avg. output restored all time" },
  { value: "5★", label: "Customer rating — Yelp & Google ↗", href: "https://www.yelp.com/biz/sun-sweeper-santa-maria?override_cta=Get+pricing" },
];

const QUICK_ACTIONS = [
  { label: "Get a Quote", message: "I'd like to get a quote" },
  { label: "See Photos", message: "Can I see photos of your solar panel cleaning work?" },
  { label: "Pricing", message: "What are your prices?" },
  { label: "SunPass Transfer", message: "Tell me about SunPass" },
] as const;

const NAV_OPENERS: Record<NavLabel, string[]> = {
  "New Chat": ["Welcome back. How can I help you today?", "New conversation started. Need help with services, pricing, or booking?", "How can I help with your property cleaning needs today?"],
  Services: ["I can walk you through each service. Which one are you considering?", "Happy to help. Which service would you like details on?", "We handle solar panels, roofs, gutters, and exterior cleaning. What do you need?"],
  SunPass: ["I can provide a quick SunPass breakdown. Want the details?", "SunPass is designed for consistent maintenance with less hassle. Want details?", "If you'd like, I can summarize SunPass in a few quick points."],
  "Contact Us": ["I can help connect you with the team. What's the best way to reach you?", "Would you prefer a call, text, or to leave a message here?", "If you'd like, I can collect your information and pass it to a specialist."],
};

const getRandomItem = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const getRandomSolarImages = (count: number): string[] => [...solarImagePaths].sort(() => Math.random() - 0.5).slice(0, count);
const SANTA_MARIA_COORDS = { latitude: 34.9530, longitude: -120.4357 };
const WEATHER_LOADING: WeatherDisplay = { city: "—", temperature: "—", icon: "—" };

const weatherCodeToEmoji = (code: number): string => {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛅";
  return "⛅";
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
  const [messages, setMessages] = useState<ChatMessage[]>([getInitialGreeting()]);
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
  const [weather, setWeather] = useState<WeatherDisplay>(WEATHER_LOADING);
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
    const hasVisited = window.localStorage.getItem("sunny_has_visited") === "true";
    setShowOnboardingModal(!hasVisited);
    setMessages((prev) => { if (prev.length !== 1 || prev[0]?.role !== "assistant") return prev; return [getInitialGreeting()]; });
  }, []);

  // Show date/time modal when Sunny asks for it — fires for any service
  useEffect(() => {
    const askedField = chatState.lastAskedField ?? chatState.roofLastAskedField;
    if (askedField === "preferred date and time" && !isLoading) setShowDateTimeModal(true);
  }, [chatState.lastAskedField, chatState.roofLastAskedField, isLoading]);

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

  useEffect(() => {
    const fetchWeatherFor = async (latitude: number, longitude: number) => {
      try {
        const [locationResponse, weatherResponse] = await Promise.all([
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`),
        ]);
        const locationData = await locationResponse.json() as { address?: { city?: string; town?: string; village?: string } };
        const weatherData = await weatherResponse.json() as { current_weather?: { temperature?: number; weathercode?: number } };
        const city = locationData.address?.city ?? locationData.address?.town ?? locationData.address?.village ?? "Santa Maria";
        const temp = weatherData.current_weather?.temperature;
        const weatherCode = weatherData.current_weather?.weathercode;
        if (typeof temp !== "number" || typeof weatherCode !== "number") {
          setWeather(WEATHER_LOADING);
          return;
        }
        setWeather({ city, temperature: `${Math.round(temp)}°F`, icon: weatherCodeToEmoji(weatherCode) });
      } catch {
        setWeather(WEATHER_LOADING);
      }
    };

    if (!("geolocation" in navigator)) {
      void fetchWeatherFor(SANTA_MARIA_COORDS.latitude, SANTA_MARIA_COORDS.longitude);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => { void fetchWeatherFor(position.coords.latitude, position.coords.longitude); },
      () => { void fetchWeatherFor(SANTA_MARIA_COORDS.latitude, SANTA_MARIA_COORDS.longitude); }
    );
  }, []);

  // Show Street View modal when address is collected — fires for solar and roof wash
  useEffect(() => {
    const address = (chatState.quoteAddress ?? chatState.roofQuoteAddress) as string | undefined;
    if (address && address !== pendingAddress && !isLoading && MAPS_API_KEY) {
      setPendingAddress(address);
      void checkStreetViewAvailable(address).then((available) => { if (available) setStreetViewAddress(address); });
    }
  }, [chatState.quoteAddress, chatState.roofQuoteAddress, isLoading, pendingAddress]);

  const handleStartChat = () => { window.localStorage.setItem("sunny_has_visited", "true"); setShowOnboardingModal(false); };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const messagesContainer = messagesRef.current;
      if (messagesContainer) { messagesContainer.scrollTop = messagesContainer.scrollHeight; return; }
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, showReferralForm]);

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
      const { reply: rawReply, state, imagePaths } = (await response.json()) as {
        reply?: string;
        state?: Record<string, unknown>;
        imagePaths?: string[];
      };
      const reply = rawReply?.trim() || "I'm sorry—something went wrong while responding.";
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply, imagePaths: imagePaths ?? [] }]);
      logSunny({ role: "assistant", type: "message", text: reply, lead_detected: false, lead_reason: "", handoff_requested: false });
      if (state) {
        setChatState(state);
        if (state.awaitingReferral === true && !state.referralSubmitted) setShowReferralForm(true);
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

  const handleDateTimeConfirm = async (dateTimeString: string) => {
    setShowDateTimeModal(false);
    setChatState((prev) => ({ ...prev, lastAskedField: undefined, roofLastAskedField: undefined }));
    await sendMessage(dateTimeString);
  };

  const handleStreetViewConfirm = () => { setStreetViewAddress(null); };

  const handleStreetViewReenter = async () => {
    setStreetViewAddress(null);
    setPendingAddress(null);
    const isRoofFlow = !!chatState.roofWashIntent;
    setChatState((prev) => isRoofFlow
      ? { ...prev, roofQuoteAddress: undefined, address: undefined, roofLastAskedField: "roofQuoteAddress" }
      : { ...prev, quoteAddress: undefined, address: undefined, lastAskedField: "quoteAddress" }
    );
    await sendMessage("I need to correct my address");
  };

  const handleReferralSubmit = async (data: { firstName: string; lastName: string; phone: string }) => {
    setIsReferralSubmitting(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "", state: chatState, messages, sessionId, referralData: data }),
      });
      const result = (await response.json()) as { reply?: string; state?: Record<string, unknown>; };
      const reply = result.reply?.trim() || "Referral noted — thank you!";
      setShowReferralForm(false);
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply }]);
      if (result.state) setChatState(result.state);
    } catch {
      setShowReferralForm(false);
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "Referral noted — thank you! Let me pull up your booking summary." }]);
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
      const reply = data.reply?.trim() || "No problem — here is your booking summary.";
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: reply }]);
      if (data.state) setChatState(data.state);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "No problem — let me pull up your booking summary." }]);
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
          <div className="weather-line">
            <span aria-hidden="true" style={{ fontSize: "18px", lineHeight: 1 }}>{weather.icon}</span>
            <span>{`${weather.city} ${weather.temperature}`}</span>
          </div>
          <div className="contact-block">
            <a className="phone" href="tel:8059381515" aria-label="Call SunSweeper at 805-938-1515">805-938-1515</a>
            <p className="contact-line">Call or Text a Live Human</p>
          </div>
        </div>
      </header>

      <section className="mobile-brand-header" aria-hidden="true">
        <Image src="/logo.png" alt="SunSweeper logo" width={100} height={54} className="mobile-hero-logo" />
        <p className="mobile-hero-kicker">SUNSWEEPER PREMIUM SERVICE</p>
      </section>

      <nav className="mobile-nav-links" aria-label="Mobile site navigation">
        <button type="button" className="service-link" onClick={() => setIsServicesDropdownOpen((prev) => !prev)}>Services</button>
        <button type="button" className="service-link" onClick={() => handleNavClick("SunPass")}>SunPass</button>
        <button type="button" className="service-link" onClick={() => handleNavClick("Contact Us")}>Contact</button>
        <a className="service-link" href={reviewDropdownLinks[3]?.href ?? "https://www.yelp.com"} target="_blank" rel="noreferrer">Reviews</a>
      </nav>
      {isServicesDropdownOpen && (
        <div className="mobile-service-dropdown-wrap">
          <div className="service-dropdown-menu mobile-service-dropdown-menu" role="menu" aria-label="Service menu">
            {SERVICE_OPTIONS.map((service) => (
              <button key={service.key} type="button" role="menuitem" className={`service-dropdown-item ${activeService === service.key ? "active" : ""}`}
                onClick={() => { handleServiceClick(service.key); setIsServicesDropdownOpen(false); }}>{service.label}</button>
            ))}
          </div>
        </div>
      )}

      <section className="mobile-headline-block">
        <h1 className="mobile-headline">The Solar Panel and Roof Cleaning Experts.</h1>
        <p className="mobile-subtext">Protecting your investment.</p>
      </section>
      <SolarPhotoStrip variant="mobile" onImageClick={setLightboxImagePath} />

      <section className="home-layout">
        <aside className="brand-panel left-sidebar">
          <Image src="/logo.png" alt="SunSweeper logo" width={160} height={87} className="hero-logo" />
          <p className="hero-kicker">SUNSWEEPER PREMIUM SERVICE</p>
          <h1 className="headline">The Solar Panel and Roof Cleaning Experts.</h1>
          <p className="hero-subtext">Protecting your investment.</p>
          <div className="stats-grid">
            {visibleStatIndexes.map((statIndex, slot) => {
              const stat = STATS_POOL[statIndex];
              const content = (<><p className="stat-value">{stat.value}</p><p className="stat-label">{stat.label}</p></>);
              return stat.href ? (
                <a key={`${stat.value}-${slot}`} href={stat.href} target="_blank" rel="noreferrer" className={`stat-tile ${fadeSlot === slot ? "fade" : ""}`}>{content}</a>
              ) : (
                <div key={`${stat.value}-${slot}`} className={`stat-tile ${fadeSlot === slot ? "fade" : ""}`}>{content}</div>
              );
            })}
          </div>
          <div className="left-list">
            <p className="left-label">Services</p>
            <ul>{SERVICE_OPTIONS.map((service) => (<li key={service.key}>{service.label}</li>))}</ul>
          </div>
          <div className="left-list">
            <p className="left-label">Santa Barbara County</p>
            <p className="city-copy">Carpinteria · Summerland · Montecito · Santa Barbara · Goleta · Isla Vista · Gaviota · Lompoc · Buellton · Solvang · Santa Ynez · Los Olivos · Los Alamos · Guadalupe · Santa Maria · Orcutt · Nipomo</p>
            <p className="left-label">San Luis Obispo County</p>
            <p className="city-copy">Arroyo Grande · Grover Beach · Pismo Beach · Shell Beach · Oceano · Avila Beach · San Luis Obispo · Los Osos · Morro Bay · Cayucos · Cambria · Templeton · Atascadero · Paso Robles · Shandon · Santa Margarita · Creston</p>
          </div>
        </aside>

        <section ref={chatShellRef} className="chat-column">
          <SolarPhotoStrip variant="desktop" onImageClick={setLightboxImagePath} />
          <section className="chat-shell">
            <div className="chat-header">
              <div className="chat-header-left">
                <span className="online-dot" aria-hidden="true" />
                <span className="chat-title">Sunny</span>
              </div>
            </div>
            <div className="quick-action-row" aria-label="Quick chat actions">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="quick-action-btn"
                  disabled={isLoading}
                  onClick={() => void sendMessage(action.message)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div ref={messagesRef} className="messages">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isLastAssistant = !isUser && index === messages.length - 1;
                const quickReplies = isLastAssistant && !isUser && Array.isArray(chatState.sunpassQuickReplies)
                  ? (chatState.sunpassQuickReplies as string[]) : [];
                return (
                  <div key={`${message.role}-${index}`} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                    <div className={`bubble ${isUser ? "user-bubble" : "assistant-bubble"}`}>
                      {message.content.split("\n").map((line, i) => (
                        <p key={i} style={{ margin: line.trim() ? "0.35em 0" : "0.8em 0" }}>{line}</p>
                      ))}
                      {!isUser && message.imagePaths && message.imagePaths.length > 0 && (
                        <ChatImageBubble images={message.imagePaths} onImageClick={setLightboxImagePath} />
                      )}
                      {quickReplies.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                          {quickReplies.map((option) => (
                            <button key={option} type="button" disabled={isLoading} onClick={() => void sendMessage(option)}
                              style={{ borderRadius: "999px", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(245,166,35,0.18)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem", cursor: isLoading ? "not-allowed" : "pointer" }}>
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
            <p className="helper-text">Not getting what you need from Sunny? Ask to speak with a live person and Sunny will take a message and get it to a specialist.</p>
          </section>
          <section className="mobile-chat-footer" aria-hidden="true">
            <h1 className="mobile-headline">The Solar Panel and Roof Cleaning Experts.</h1>
            <p className="mobile-subtext">Protecting your investment.</p>
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
      <style jsx global>{`
        .mobile-brand-header, .mobile-nav-links, .mobile-service-dropdown-wrap, .mobile-chat-footer, .mobile-headline-block { display: none; }
        .hero-logo { display: block !important; width: 160px !important; height: auto !important; margin: 0 auto 16px auto !important; opacity: 1 !important; visibility: visible !important; }
        .page-background { z-index: 0; }
        .top-nav, .home-layout, .mobile-brand-header, .mobile-nav-links, .mobile-service-dropdown-wrap, .mobile-chat-footer, .mobile-headline-block, .solar-photo-strip { position: relative; z-index: 1; }
        @media (max-width: 768px) {
          .top-nav-center { display: none; }
          .mobile-brand-header { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 10px 0 8px; opacity: 1; filter: none; mix-blend-mode: normal; }
          .mobile-hero-logo { width: 100px; height: auto; opacity: 1 !important; position: relative; z-index: 10; }
          .mobile-hero-kicker { margin: 0; color: #f5a623; font-size: 10px; letter-spacing: 0.16em; text-align: center; }
          .mobile-nav-links { display: flex; justify-content: center; gap: 20px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
          .mobile-service-dropdown-wrap { display: flex; justify-content: center; padding: 8px 0; position: relative; z-index: 50; }
          .mobile-service-dropdown-menu { position: relative; z-index: 100; width: min(92vw, 360px); }
          .mobile-headline-block { display: block; padding: 12px 18px 6px; text-align: center; }
          .solar-photo-strip-desktop { display: none; }
          .solar-photo-strip-mobile { display: block; padding: 8px 12px 12px; }
          .left-sidebar, .brand-panel { display: none; }
          .chat-column { width: 100%; }
          .chat-shell { width: 100%; min-height: 60vh; border-radius: 12px; }
          .mobile-chat-footer { display: none; padding: 24px 20px; text-align: center; }
          .mobile-headline { margin: 0; font-family: "DM Serif Display", serif; font-size: 22px; line-height: 1.2; }
          .mobile-subtext { margin: 8px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.65); }
        }
      `}</style>
    </main>
  );
}
