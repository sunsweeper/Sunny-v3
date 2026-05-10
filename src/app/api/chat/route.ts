import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  frustrationDelta,
  isHandoffAccepted,
  shouldOfferHandoff,
} from "../../../lib/frustration";

import { SAFE_FAIL_MESSAGE } from "../../../sunnyRuntime";

import { SUNNY_SYSTEM_PROMPT } from "../../../../sunny-system-prompt";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────────────────────────
// GOOGLE SHEETS LOGGING
// ─────────────────────────────────────────────────────────────────

const SHEET_URL =
  process.env.SUNNY_SHEET_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbzf9rDq_0RELBDZ9nEycVPej2Ow53r4c4xvEtcic9JYWURlwwerTHciILU9ydsUf9bU_Q/exec";

async function logToSheet(payload: Record<string, unknown>): Promise<void> {
  try {
    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[SHEET] write failed:", response.status, body.slice(0, 300));
    } else {
      const result = await response.json();
      console.log("[SHEET] write ok:", result);
    }
  } catch (err) {
    console.error("[SHEET] write error:", err);
  }
}

function logToSheetAsync(payload: Record<string, unknown>): void {
  logToSheet(payload).catch((err) => console.error("[SHEET] async error:", err));
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

type BookingState = {
  panelCount?: number;
  price?: number;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  dateTime?: string;
  confirmed?: boolean;
  awaitingConfirmation?: boolean;
  intent?: string;
  lastAskedField?: string;
  // Solar quoting sub-fields
  quoteAddress?: string;
  quoteStorey?: "1" | "2";
  quoteLastCleaned?: "never" | "lt2" | "gt2";
  quoteReady?: boolean;
  lichenSurchargeApplied?: boolean;
  // Referral fields
  awaitingReferral?: boolean;
  referralSubmitted?: boolean;
  referralData?: { firstName: string; lastName: string; phone: string } | null;
  // SunPass fields
  sunpassLeadActive?: boolean;
  sunpassLeadData?: Record<string, string>;
  sunpassLastAskedField?: string;
  sunpassAwaitingConfirmation?: boolean;
  activeConversationState?: "sunpass_intro" | "sunpass_role_prompt" | "sunpass_followup";
  sunpassQuickReplies?: string[];
  // Roof wash quoting sub-fields
  roofWashIntent?: boolean;
  roofSqft?: number;
  roofStorey?: "1" | "2";
  roofLastCleaned?: "lt2" | "gt2" | "never";
  roofStreaking?: boolean;
  roofLichen?: boolean;
  roofQuoteAddress?: string;
  roofQuoteReady?: boolean;
  roofQuotePrice?: number;
  roofLastAskedField?: string;
  [key: string]: unknown;
};

type SunPassData = {
  name: string;
  tagline?: string;
  description?: string;
  purpose?: string;
  services?: string[];
  audience?: string[];
  lead_capture_fields?: string[];
  cta_examples?: string[];
  lead_intent_phrases?: string[];
  about_chat_response?: {
    intro?: string;
    purpose?: string;
    who_it_helps?: string;
    what_it_includes?: string;
    cta?: string;
  };
};

type SessionState = {
  frustrationScore: number;
  lastHandoffOfferedAt: number | null;
  handoffActive: boolean;
  handoffCollecting: "contact" | "message" | null;
  handoffContact?: string;
  handoffMessage?: string;
};

const sessionStateMap = new Map<string, SessionState>();

const getDefaultSessionState = (): SessionState => ({
  frustrationScore: 0,
  lastHandoffOfferedAt: null,
  handoffActive: false,
  handoffCollecting: null,
});

type ConversationLogEntry = {
  timestamp: string;
  session_id: string;
  role: "user" | "assistant";
  message: string;
};

const sunpassPath = path.join(process.cwd(), "data/sunpass.json");

function loadSunPassData(): SunPassData | null {
  try {
    return JSON.parse(fs.readFileSync(sunpassPath, "utf8")) as SunPassData;
  } catch (error) {
    console.error("[SUNPASS] unable to load data file", error);
    return null;
  }
}

const FALLBACK_SUNPASS_LEAD_FIELDS = [
  "full_name",
  "email",
  "phone_optional",
  "property_address_optional",
  "role",
  "notes",
];

const SUNPASS_DEFAULT_INTENTS = [
  "have someone contact me",
  "reach out to me",
  "have sunpass contact me",
  "i want more info",
  "i am buying a home with solar",
  "i am selling a home with solar",
  "i am an agent",
  "i need help with solar on a home sale",
];

const SUNPASS_ROLE_PROMPT =
  "Let me break SunPass down for you. Are you a 1) Homeowner, 2) Home Buyer, or 3) Real Estate Agent?";

const SUNPASS_ROLE_QUICK_REPLIES = ["Homeowner", "Home Buyer", "Real Estate Agent"];

const SUNPASS_HOMEOWNER_RESPONSE = `SunPass gives you a clear picture of what your solar system is actually worth and how it's performing.

System Inspection & Valuation — We visually inspect and document your solar array and compile an easily digestible report that includes brand, size, remaining warranty, visual condition, and product-specific notes on your panels, inverter, battery (if included), and wiring.
Inverter Reconnection — If your system went offline after a sale or service gap, we get you back online so you can monitor your own production through SolarEdge or Enphase.

Learn more at SunPassSolar.com`;

const SUNPASS_HOME_BUYER_RESPONSE = `Buying a home with solar is great — unless nobody can tell you what the system is actually worth or whether it's working.

System Inspection & Valuation — We visually inspect and document your solar array and compile an easily digestible report that includes brand, size, remaining warranty, visual condition, and product-specific notes on your panels, inverter, battery (if included), and wiring.
Inverter Reconnection — We get the system in your name and online so you can monitor your own production from day one.

Learn more at SunPassSolar.com`;

const SUNPASS_AGENT_RESPONSE = `SunPass costs you nothing and makes solar a documented, appraiser-ready asset on every transaction.

System Inspection & Valuation — We visually inspect and document the solar array and compile an easily digestible report that includes brand, size, remaining warranty, visual condition, and product-specific notes on the panels, inverter, battery (if included), and wiring. Formal documentation you can use in MLS listings, your appraiser and lender can use to include solar in the home's value — meaning higher comps and larger loan amounts.
Full Disclosure Protection — Your clients get the complete picture on condition, size, and output. Clean disclosure, no surprises at close.
Inverter Reconnection — New owner gets connected and monitoring from day one.

Order it on every solar listing and it pays for itself in commission.
Learn more at SunPassSolar.com`;

const SUNPASS_INTRO_CONFIRMATIONS = [
  "yes",
  "yeah",
  "sure",
  "please",
  "ok",
  "okay",
  "sounds good",
  "tell me more",
];

const SUNPASS_ROLE_PATTERNS: Record<string, RegExp> = {
  home_buyer: /\b(buying|buyer|purchase|purchasing)\b/i,
  home_seller: /\b(selling|seller|listing)\b/i,
  real_estate_agent: /\b(agent|realtor|broker)\b/i,
};

function normalizeLeadFieldLabel(field: string): string {
  if (field === "full_name") return "full name";
  if (field === "email") return "email";
  if (field === "phone_optional") return "phone number";
  if (field === "property_address_optional") return "property address";
  return field.replace(/_/g, " ");
}

function isOptionalLeadField(field: string): boolean {
  return field.endsWith("_optional");
}

function normalizeFieldValue(field: string, value: string): string {
  if (isOptionalLeadField(field) && /^(skip|none|na|n\/a|no)$/i.test(value.trim())) {
    return "Not provided";
  }
  return value.trim();
}

function detectSunPassTopic(messageLower: string): boolean {
  return (
    messageLower.includes("sunpass") ||
    /\bsolar monitoring\b/.test(messageLower) ||
    /\bsolar transfer\b/.test(messageLower) ||
    /\bsolar inspection\b/.test(messageLower) ||
    /\bsolar valuation\b/.test(messageLower) ||
    /\bsolar documentation\b/.test(messageLower) ||
    (messageLower.includes("solar") &&
      /(real estate|home sale|escrow|buying|selling|agent)/.test(messageLower))
  );
}

function detectSunPassAudience(messageLower: string): "homeowner" | "home_buyer" | "agent" | null {
  if (/\b(real estate agent|realtor|broker|listing agent|agent)\b/i.test(messageLower)) {
    return "agent";
  }
  if (/\b(home buyer|homebuyer|buyer|buying|purchasing|purchase)\b/i.test(messageLower)) {
    return "home_buyer";
  }
  if (/\b(homeowner|owner|home owner)\b/i.test(messageLower)) {
    return "homeowner";
  }
  return null;
}

function getSunPassAudienceResponse(
  audience: "homeowner" | "home_buyer" | "agent"
): string {
  if (audience === "agent") return SUNPASS_AGENT_RESPONSE;
  if (audience === "home_buyer") return SUNPASS_HOME_BUYER_RESPONSE;
  return SUNPASS_HOMEOWNER_RESPONSE;
}

function detectSunPassLeadIntent(messageLower: string, phrases: string[]): boolean {
  return phrases.some((phrase) => messageLower.includes(phrase));
}

function isSunPassIntroConfirmation(messageLower: string): boolean {
  const normalized = messageLower.trim();
  return SUNPASS_INTRO_CONFIRMATIONS.some(
    (phrase) => normalized === phrase || normalized.startsWith(`${phrase} `)
  );
}

function isShortChatReply(messageLower: string): boolean {
  return messageLower.trim().split(/\s+/).filter(Boolean).length <= 4;
}

function buildSunPassLeadSummary(leadData: Record<string, string>) {
  return [
    "Please confirm your SunPass lead details",
    `name ${leadData.full_name || "Not provided"}`,
    `email ${leadData.email || "Not provided"}`,
    `phone ${leadData.phone_optional || "Not provided"}`,
    `role ${leadData.role || "Not provided"}`,
    `property address ${leadData.property_address_optional || "Not provided"}`,
    `notes ${leadData.notes || "Not provided"}`,
    "Reply YES to confirm or tell me what to update",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────
// CONVERSATION LOGGING
// ─────────────────────────────────────────────────────────────────

async function writeConversationLog(entry: ConversationLogEntry) {
  console.log("[SUNNY-LOG]", JSON.stringify(entry));
  logToSheetAsync({
    session_id: entry.session_id,
    role: entry.role,
    type: "conversation",
    text: entry.message,
  });
}

async function logConversationTurn(payload: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const timestamp = new Date().toISOString();
  console.log("[SUNNY-LOG] logging turn for session", payload.sessionId);

  await writeConversationLog({
    timestamp,
    session_id: payload.sessionId,
    role: "user",
    message: payload.userMessage,
  });

  await writeConversationLog({
    timestamp,
    session_id: payload.sessionId,
    role: "assistant",
    message: payload.assistantMessage,
  });
}

function logHandoffRequest(payload: { sessionId: string; contact: string; message: string }) {
  console.log(
    "[SUNNY-HANDOFF]",
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload })
  );
}

function logSunPassLeadCapture(payload: {
  sessionId: string;
  email: string;
  phone: string;
  role: string;
}) {
  console.log(
    "[SUNPASS-LEAD]",
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload })
  );
}

// ─────────────────────────────────────────────────────────────────
// PRICING ENGINE — SHARED
// ─────────────────────────────────────────────────────────────────

const CORE_ZIPS = new Set([
  "93454", "93455", "93458",
  "93436", "93437", "93438",
  "93434",
  "93440",
  "93444", "93445",
]);

const ZIP_DISTANCE_FROM_ORCUTT: Record<string, number> = {
  "93420": 22, "93421": 22, "93424": 18, "93433": 20, "93449": 18, "93452": 35,
  "93401": 50, "93405": 50, "93406": 48, "93407": 50, "93408": 50,
  "93409": 50, "93410": 50,
  "93446": 65, "93461": 68, "93465": 65,
  "93427": 28, "93441": 30, "93460": 32, "93463": 35, "93464": 33, "93429": 15,
  "93101": 55, "93103": 55, "93105": 53, "93108": 60, "93109": 55,
  "93110": 52, "93111": 50, "93117": 44, "93120": 50, "93130": 50,
  "93013": 65, "93014": 65, "93067": 62,
};

const MILEAGE_RATE = 0.73;
const FREE_RADIUS_MILES = 10;

function extractZip(address: string): string | null {
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

function getMileageSurcharge(address: string): number {
  const zip = extractZip(address);
  if (!zip) return 0;
  if (CORE_ZIPS.has(zip)) return 0;
  const miles = ZIP_DISTANCE_FROM_ORCUTT[zip] ?? 30;
  const billableMiles = Math.max(0, miles - FREE_RADIUS_MILES);
  return Math.round(billableMiles * 2 * MILEAGE_RATE * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────
// PRICING ENGINE — SOLAR
// ─────────────────────────────────────────────────────────────────

interface PanelTier {
  min: number;
  max: number;
  job_total_usd: number;
}

interface SolarPricingBlock {
  panel_tiers: PanelTier[];
  minimum_charge_usd: number;
  escalation_rules: {
    max_panels_for_auto_quote: number;
    escalate_over_max: boolean;
  };
}

function loadSolarPricing(): SolarPricingBlock | null {
  try {
    const pricingPath = path.join(process.cwd(), "knowledge/pricing.json");
    const raw = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
    const solar = raw.pricing_rules?.solar_panel_cleaning;
    if (!solar) return null;
    return {
      panel_tiers: solar.panel_tiers,
      minimum_charge_usd: solar.minimum_charge_usd ?? 149,
      escalation_rules: solar.escalation_rules ?? {
        max_panels_for_auto_quote: 100,
        escalate_over_max: true,
      },
    };
  } catch (err) {
    console.error("Solar pricing load error:", err);
    return null;
  }
}

function getBasePrice(panelCount: number, pricing: SolarPricingBlock): number | null {
  if (panelCount > pricing.escalation_rules.max_panels_for_auto_quote) return null;
  const tier = pricing.panel_tiers.find((t) => panelCount >= t.min && panelCount <= t.max);
  return tier ? tier.job_total_usd : pricing.minimum_charge_usd;
}

function buildFinalQuote(state: BookingState): {
  price: number | null;
  lichenNote: boolean;
  overMax: boolean;
} {
  const panelCount = state.panelCount!;
  const pricing = loadSolarPricing();
  if (!pricing) return { price: null, lichenNote: false, overMax: false };

  if (panelCount > pricing.escalation_rules.max_panels_for_auto_quote) {
    return { price: null, lichenNote: false, overMax: true };
  }

  let base = getBasePrice(panelCount, pricing);
  if (base === null) return { price: null, lichenNote: false, overMax: true };

  if (state.quoteStorey === "2") {
    base = base * 1.1;
  }

  const lichenNote =
    state.quoteLastCleaned === "never" || state.quoteLastCleaned === "gt2";
  if (lichenNote) {
    base = base + panelCount * 2;
  }

  const mileage = state.quoteAddress ? getMileageSurcharge(state.quoteAddress) : 0;
  base = base + mileage;

  return { price: Math.round(base), lichenNote, overMax: false };
}

// ─────────────────────────────────────────────────────────────────
// PRICING ENGINE — ROOF WASH
// ─────────────────────────────────────────────────────────────────

const ROOF_BASE_RATE = 0.55;
const ROOF_CONDITION_2_ADDER = 0.10;
const ROOF_CONDITION_3_ADDER = 0.15;
const ROOF_STOREY_ADDER = 0.10;
const ROOF_LICHEN_ADDER = 0.10;
const ROOF_MINIMUM = 849;
const ROOF_TRAVEL_RATE = 0.70; // per mile, round trip flat add

function getRoofMileageSurcharge(address: string): number {
  const zip = extractZip(address);
  if (!zip) return 0;
  if (CORE_ZIPS.has(zip)) return 0;
  const miles = ZIP_DISTANCE_FROM_ORCUTT[zip] ?? 30;
  const billableMiles = Math.max(0, miles - FREE_RADIUS_MILES);
  return Math.round(billableMiles * 2 * ROOF_TRAVEL_RATE * 100) / 100;
}

function buildRoofQuote(state: BookingState): number {
  const sqft = state.roofSqft ?? 0;

  // Determine condition adder
  let conditionAdder = 0;
  const lastCleaned = state.roofLastCleaned;
  const hasStreaking = state.roofStreaking === true;

  // Level 3: never cleaned OR 5+ years (gt2 covers both) AND significant streaking
  // Level 2: cleaned 2-5 years ago OR minor streaking
  // Level 1: cleaned within 2 years AND no streaking
  if (lastCleaned === "never" || (lastCleaned === "gt2" && hasStreaking)) {
    conditionAdder = ROOF_CONDITION_3_ADDER;
  } else if (lastCleaned === "gt2" || hasStreaking) {
    conditionAdder = ROOF_CONDITION_2_ADDER;
  }
  // else lt2 and no streaking = Level 1, no adder

  const storeyAdder = state.roofStorey === "2" ? ROOF_STOREY_ADDER : 0;
  const lichenAdder = state.roofLichen === true ? ROOF_LICHEN_ADDER : 0;

  const ratePerSqft = ROOF_BASE_RATE + conditionAdder + storeyAdder + lichenAdder;
  let total = sqft * ratePerSqft;

  // Travel surcharge
  const travel = state.roofQuoteAddress ? getRoofMileageSurcharge(state.roofQuoteAddress) : 0;
  total += travel;

  return Math.max(ROOF_MINIMUM, Math.round(total));
}

// ─────────────────────────────────────────────────────────────────
// SOLAR QUOTING STATE MACHINE
// ─────────────────────────────────────────────────────────────────

type QuoteField = "quoteAddress" | "panelCount" | "quoteStorey" | "quoteLastCleaned";

function getNextQuoteField(state: BookingState): QuoteField | null {
  if (!state.quoteAddress) return "quoteAddress";
  if (!state.panelCount) return "panelCount";
  if (!state.quoteStorey) return "quoteStorey";
  if (!state.quoteLastCleaned) return "quoteLastCleaned";
  return null;
}

const QUOTE_QUESTIONS: Record<QuoteField, string> = {
  quoteAddress: "What is the service address, including city and zip code?",
  panelCount:
    "How many solar panels does the system have? I need the exact count to prepare an accurate quote.",
  quoteStorey: "Are the panels on a single-story or two-story roof?",
  quoteLastCleaned:
    "When were the panels last cleaned — within the last 2 years, more than 2 years ago, or never?",
};

// ─────────────────────────────────────────────────────────────────
// ROOF WASH QUOTING STATE MACHINE
// ─────────────────────────────────────────────────────────────────

type RoofQuoteField =
  | "roofSqft"
  | "roofStorey"
  | "roofLastCleaned"
  | "roofStreaking"
  | "roofLichen"
  | "roofQuoteAddress";

function getRoofNextField(state: BookingState): RoofQuoteField | null {
  if (!state.roofSqft) return "roofSqft";
  if (!state.roofStorey) return "roofStorey";
  if (state.roofLastCleaned === undefined) return "roofLastCleaned";
  if (state.roofStreaking === undefined) return "roofStreaking";
  if (state.roofLichen === undefined) return "roofLichen";
  if (!state.roofQuoteAddress) return "roofQuoteAddress";
  return null;
}

const ROOF_QUOTE_QUESTIONS: Record<RoofQuoteField, string> = {
  roofSqft: "What is the square footage of your roof?",
  roofStorey: "Is your home one story or two stories?",
  roofLastCleaned: "When was the last time you had your roof professionally cleaned?",
  roofStreaking: "Is there any visible streaking or buildup of organic material on your roof?",
  roofLichen: "Do you notice any white, grey, or greenish crusty patches on your roof?",
  roofQuoteAddress: "What is the service address, including city and zip code?",
};

function parseYesNo(message: string): boolean | null {
  const m = message.toLowerCase().trim();
  if (/\b(yes|yeah|yep|yup|correct|affirmative|absolutely|definitely|some|a (little|bit|few)|visible|noticed|there is|there are|i do|i see)\b/i.test(m)) return true;
  if (/\b(no|nope|none|not really|don't|dont|nothing|clean|clear|not that i|can't see|cant see)\b/i.test(m)) return false;
  return null;
}

function parseRoofLastCleaned(message: string): "lt2" | "gt2" | "never" | null {
  const m = message.toLowerCase();
  if (/never|not.*clean|first.*time|brand.?new|never been/i.test(m)) return "never";
  if (/\b(over|more than|greater than|beyond)\s*(2|two)\s*year/i.test(m)) return "gt2";
  if (/\b[3-9]\s*year|\b[1-9]\d+\s*year/i.test(m)) return "gt2";
  if (/\b(few|couple|several|some)\s*year/i.test(m)) return "gt2";
  if (/\b5\s*year|\b4\s*year/i.test(m)) return "gt2";
  if (/\b\d+\s*(day|days|week|weeks|month|months)\s*(ago)?/i.test(m)) return "lt2";
  if (/\b(1|one|a)\s*year\s*(ago)?/i.test(m)) return "lt2";
  if (/\blast\s*year\b/i.test(m)) return "lt2";
  if (/\b2\s*year/i.test(m)) return "gt2";
  if (/\b(within|less|under|recent)\s*(the\s*)?(last\s*)?(1|2|one|two)\s*year/i.test(m)) return "lt2";
  if (/\b(not sure|don.?t know|unsure|no idea|a while|long time|ages|been a while|awhile|can.?t remember|forget|forgot|unknown|not certain)\b/i.test(m)) return "gt2";
  if (m.trim().length > 0) return "gt2";
  return null;
}

function parseRoofSqft(message: string): number | null {
  // Match patterns like "1500", "1,500", "1500 sq ft", "about 1500"
  const match = message.replace(/,/g, "").match(/(\d{3,5})/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 100 && n <= 20000) return n;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// SHARED PARSERS
// ─────────────────────────────────────────────────────────────────

function parseStorey(message: string): "1" | "2" | null {
  if (/\b(one|1|single|1.?stor)/i.test(message)) return "1";
  if (/\b(two|2|second|2.?stor)/i.test(message)) return "2";
  return null;
}

function parseLastCleaned(message: string): "never" | "lt2" | "gt2" | null {
  const m = message.toLowerCase();

  if (/never|not.*clean|first.*time|brand.?new/i.test(m)) return "never";
  if (/\b(over|more than|greater than|beyond)\s*(2|two)\s*year/i.test(m)) return "gt2";
  if (/\b[3-9]\s*year|\b[1-9]\d+\s*year/i.test(m)) return "gt2";
  if (/\b(few|couple|several|some)\s*year/i.test(m)) return "gt2";
  if (/\b\d+\s*(day|days|week|weeks|month|months)\s*(ago)?/i.test(m)) return "lt2";
  if (/\b(1|one|a)\s*year\s*(ago)?/i.test(m)) return "lt2";
  if (/\blast\s*year\b/i.test(m)) return "lt2";
  if (/\b2\s*year/i.test(m)) return "gt2";
  if (/\b(within|less|under|recent)\s*(the\s*)?(last\s*)?(1|2|one|two)\s*year/i.test(m)) return "lt2";
  if (/\b(not sure|don.?t know|unsure|no idea|a while|long time|ages|been a while|awhile|can.?t remember|forget|forgot|unknown|not certain)\b/i.test(m)) return "gt2";
  if (m.trim().length > 0) return "gt2";

  return null;
}

function parsePanelCount(message: string, isDirectAnswer: boolean = false): number | null {
  const explicit = message.match(/(\d{1,3})\s*(?:solar\s*)?panels?/i);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n >= 1 && n <= 200) return n;
  }
  if (isDirectAnswer) {
    const bare = message.match(/^\s*(\d{1,3})\s*$/);
    if (bare) {
      const n = parseInt(bare[1], 10);
      if (n >= 1 && n <= 200) return n;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// REFERRAL EMAIL
// ─────────────────────────────────────────────────────────────────

async function sendReferralEmail(payload: {
  referrerName: string;
  referrerEmail: string;
  referralFirstName: string;
  referralLastName: string;
  referralPhone: string;
  baseUrl: string;
}) {
  const { referrerName, referrerEmail, referralFirstName, referralLastName, referralPhone, baseUrl } = payload;
  try {
    await fetch(`${baseUrl}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: ["aaron@sunsweeper.com"],
        subject: `New Referral from ${referrerName}`,
        html: `
          <h2>New Referral</h2>
          <p><strong>Referred by:</strong> ${referrerName} (${referrerEmail})</p>
          <p><strong>Referral name:</strong> ${referralFirstName} ${referralLastName}</p>
          <p><strong>Referral phone:</strong> ${referralPhone}</p>
          <p><em>If this person books a service, apply a 10% credit (up to $500) to ${referrerName}'s account.</em></p>
        `,
        text: `New referral from ${referrerName} (${referrerEmail}): ${referralFirstName} ${referralLastName}, ${referralPhone}`,
      }),
    });
  } catch (err) {
    console.error("[REFERRAL] Email send failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log("[SUNNY-API-MARKER] /api/chat POST hit at", timestamp);

  try {
    const body = (await request.json()) as {
      message?: string;
      state?: BookingState;
      messages?: Message[];
      sessionId?: string;
      referralData?: { firstName: string; lastName: string; phone: string };
    };

    const rawMessage = body.message ?? "";
    const message = rawMessage.trim();
    const messageLower = message.toLowerCase();
    let currentState: BookingState = body.state ?? {};
    const sessionId = (body.sessionId || "anonymous").trim() || "anonymous";

    const respondWithLoggedReply = async (
      reply: string,
      state: BookingState,
      status = 200
    ) => {
      await logConversationTurn({
        sessionId,
        userMessage: message || "[empty-message]",
        assistantMessage: reply,
      });
      return NextResponse.json({ reply, state }, { status });
    };

    const sunpassData = loadSunPassData();
    const sunpassLeadFields = sunpassData?.lead_capture_fields || FALLBACK_SUNPASS_LEAD_FIELDS;
    const sunpassIntentPhrases = sunpassData?.lead_intent_phrases || SUNPASS_DEFAULT_INTENTS;

    const now = Date.now();
    const priorSessionState = sessionStateMap.get(sessionId) ?? getDefaultSessionState();
    let sessionState: SessionState = {
      ...priorSessionState,
      frustrationScore:
        Math.max(0, priorSessionState.frustrationScore - 1) + frustrationDelta(message),
    };

    const offerHandoff = shouldOfferHandoff({
      frustrationScore: sessionState.frustrationScore,
      handoffActive: sessionState.handoffActive,
      lastHandoffOfferedAt: sessionState.lastHandoffOfferedAt,
      now,
    });

    if (offerHandoff) {
      sessionState.lastHandoffOfferedAt = now;
    }

    const userAcceptedHandoff =
      sessionState.lastHandoffOfferedAt !== null &&
      now - sessionState.lastHandoffOfferedAt <= 10 * 60 * 1000 &&
      !sessionState.handoffActive &&
      isHandoffAccepted(message);

    if (userAcceptedHandoff) {
      sessionState.handoffActive = true;
      sessionState.handoffCollecting = "contact";
      sessionStateMap.set(sessionId, sessionState);
      return respondWithLoggedReply(
        "Perfect — I can hand this to a live specialist. What's the best phone number or email for them to reach you? 🌞",
        currentState
      );
    }

    if (sessionState.handoffActive) {
      if (sessionState.handoffCollecting === "contact") {
        sessionState.handoffContact = message;
        sessionState.handoffCollecting = "message";
        sessionStateMap.set(sessionId, sessionState);
        return respondWithLoggedReply(
          "Got it. Give me a short message about what you need help with, and I'll pass it along.",
          currentState
        );
      }

      if (sessionState.handoffCollecting === "message") {
        sessionState.handoffMessage = message;
        if (sessionState.handoffContact && sessionState.handoffMessage) {
          logHandoffRequest({
            sessionId,
            contact: sessionState.handoffContact,
            message: sessionState.handoffMessage,
          });
        }
        sessionState = {
          ...sessionState,
          handoffActive: false,
          handoffCollecting: null,
          handoffContact: undefined,
          handoffMessage: undefined,
        };
        sessionStateMap.set(sessionId, sessionState);
        return respondWithLoggedReply(
          "Done — I've sent your message to a live specialist. Someone from our team will follow up using your contact info soon. ✨",
          currentState
        );
      }
    }

    sessionStateMap.set(sessionId, sessionState);
    console.log(
      "[SUNNY-API-MARKER] Incoming message:",
      message.substring(0, 100),
      "state keys:",
      Object.keys(currentState)
    );

    if (!message && !body.referralData) {
      return respondWithLoggedReply(SAFE_FAIL_MESSAGE, currentState, 400);
    }

    // ──────────────────────────────────────────────────────────────
    // REFERRAL FORM SUBMISSION
    // ──────────────────────────────────────────────────────────────

    if (body.referralData) {
      const { firstName, lastName, phone } = body.referralData;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.sunsweeper.com";

      await sendReferralEmail({
        referrerName: currentState.fullName || "A customer",
        referrerEmail: currentState.email || "unknown",
        referralFirstName: firstName,
        referralLastName: lastName,
        referralPhone: phone,
        baseUrl,
      });

      const state: BookingState = {
        ...currentState,
        awaitingReferral: false,
        referralSubmitted: true,
        referralData: { firstName, lastName, phone },
        awaitingConfirmation: true,
        lastAskedField: undefined,
      };

      const price = typeof state.price === "number" ? state.price : 0;
      const summary = `Got it — referral noted for ${firstName} ${lastName}.

Here's your booking summary${state.fullName ? `, ${state.fullName}` : ""}:
- Name: ${state.fullName || "Not set"}
- Email: ${state.email || "Not set"}
- Phone: ${state.phone || "Not set"}
- Address: ${state.address || "Not set"}
- Date & Time: ${state.dateTime || "Not set"}
- Service: Cleaning ${state.panelCount} solar panels for $${price.toFixed(2)}

Does everything look correct? Reply YES to confirm, or tell me what to change.`;

      return respondWithLoggedReply(summary.trim(), state);
    }

    // ──────────────────────────────────────────────────────────────
    // SUNPASS CONVERSATION STATE
    // ──────────────────────────────────────────────────────────────

    if (currentState.activeConversationState === "sunpass_intro") {
      const selectedAudience = detectSunPassAudience(messageLower);
      if (selectedAudience) {
        return respondWithLoggedReply(getSunPassAudienceResponse(selectedAudience), {
          ...currentState,
          activeConversationState: "sunpass_followup",
          sunpassQuickReplies: undefined,
        });
      }

      if (detectSunPassLeadIntent(messageLower, sunpassIntentPhrases)) {
        const firstField =
          sunpassLeadFields.find((field) => !isOptionalLeadField(field)) || "full_name";
        return respondWithLoggedReply(
          "Absolutely. I can have SunPass reach out by email. Please share your full name to get started.",
          {
            ...currentState,
            sunpassLeadActive: true,
            sunpassLeadData: {},
            sunpassLastAskedField: firstField,
            sunpassAwaitingConfirmation: false,
            activeConversationState: "sunpass_followup",
          }
        );
      }

      if (isSunPassIntroConfirmation(messageLower)) {
        return respondWithLoggedReply(SUNPASS_ROLE_PROMPT, {
          ...currentState,
          activeConversationState: "sunpass_role_prompt",
          sunpassQuickReplies: SUNPASS_ROLE_QUICK_REPLIES,
        });
      }

      if (sunpassData) {
        return respondWithLoggedReply(SUNPASS_ROLE_PROMPT, {
          ...currentState,
          activeConversationState: "sunpass_role_prompt",
          sunpassQuickReplies: SUNPASS_ROLE_QUICK_REPLIES,
        });
      }
    }

    if (currentState.activeConversationState === "sunpass_role_prompt") {
      const selectedAudience = detectSunPassAudience(messageLower);
      if (!selectedAudience) {
        return respondWithLoggedReply(SUNPASS_ROLE_PROMPT, {
          ...currentState,
          sunpassQuickReplies: SUNPASS_ROLE_QUICK_REPLIES,
        });
      }

      return respondWithLoggedReply(getSunPassAudienceResponse(selectedAudience), {
        ...currentState,
        activeConversationState: "sunpass_followup",
        sunpassQuickReplies: undefined,
      });
    }

    if (currentState.activeConversationState === "sunpass_followup") {
      if (detectSunPassLeadIntent(messageLower, sunpassIntentPhrases)) {
        const firstField =
          sunpassLeadFields.find((field) => !isOptionalLeadField(field)) || "full_name";
        return respondWithLoggedReply(
          "Absolutely. I can have SunPass reach out by email. Please share your full name to get started.",
          {
            ...currentState,
            sunpassLeadActive: true,
            sunpassLeadData: {},
            sunpassLastAskedField: firstField,
            sunpassAwaitingConfirmation: false,
          }
        );
      }

      if (
        isShortChatReply(messageLower) &&
        !detectSunPassLeadIntent(messageLower, sunpassIntentPhrases)
      ) {
        return respondWithLoggedReply(
          "If you would like, I can have SunPass reach out by email. Just say 'have SunPass contact me' and I will collect your details.",
          currentState
        );
      }

      if (sunpassData && detectSunPassTopic(messageLower)) {
        const selectedAudience = detectSunPassAudience(messageLower);
        if (selectedAudience) {
          return respondWithLoggedReply(getSunPassAudienceResponse(selectedAudience), {
            ...currentState,
            sunpassQuickReplies: undefined,
          });
        }
        return respondWithLoggedReply(SUNPASS_ROLE_PROMPT, {
          ...currentState,
          activeConversationState: "sunpass_role_prompt",
          sunpassQuickReplies: SUNPASS_ROLE_QUICK_REPLIES,
        });
      }

      currentState = { ...currentState, activeConversationState: undefined };
    }

    if (currentState.sunpassLeadActive) {
      const leadData = { ...(currentState.sunpassLeadData || {}) };

      if (currentState.sunpassLastAskedField && message.trim()) {
        const field = currentState.sunpassLastAskedField;
        leadData[field] = normalizeFieldValue(field, message);

        if (field === "role") {
          for (const [roleKey, rolePattern] of Object.entries(SUNPASS_ROLE_PATTERNS)) {
            if (rolePattern.test(message)) {
              leadData.role = roleKey;
              break;
            }
          }
        }
      }

      if (!currentState.sunpassAwaitingConfirmation) {
        const missing = sunpassLeadFields.filter((field) => !leadData[field]);

        if (missing.length > 0) {
          const nextField = missing[0];
          const label = normalizeLeadFieldLabel(nextField);
          const optionalHint = isOptionalLeadField(nextField)
            ? " (optional, you can say skip)"
            : "";
          const reply = `Got it. Please share your ${label}${optionalHint} for the SunPass follow up.`;
          return respondWithLoggedReply(reply, {
            ...currentState,
            sunpassLeadActive: true,
            sunpassLeadData: leadData,
            sunpassLastAskedField: nextField,
          });
        }

        const summary = buildSunPassLeadSummary(leadData);
        return respondWithLoggedReply(summary, {
          ...currentState,
          sunpassLeadActive: true,
          sunpassLeadData: leadData,
          sunpassLastAskedField: undefined,
          sunpassAwaitingConfirmation: true,
        });
      }

      if (
        ["yes", "confirm", "looks good", "correct"].some((word) =>
          messageLower.includes(word)
        )
      ) {
        const timestampIso = new Date().toISOString();
        const emailTo = process.env.SUNPASS_CONTACT_EMAIL || "aaron@sunsweeper.com";
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.sunsweeper.com";

        try {
          const recentContext = (body.messages || [])
            .slice(-8)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n");
          await fetch(`${baseUrl}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [emailTo],
              subject: "New SunPass Lead from Sunny",
              text: [
                `name: ${leadData.full_name || "Not provided"}`,
                `email: ${leadData.email || "Not provided"}`,
                `phone: ${leadData.phone_optional || "Not provided"}`,
                `role: ${leadData.role || "Not provided"}`,
                `property address: ${leadData.property_address_optional || "Not provided"}`,
                `notes: ${leadData.notes || "Not provided"}`,
                `timestamp: ${timestampIso}`,
                `chat context: ${recentContext || "Not available"}`,
              ].join("\n"),
              html: `
                <h2>New SunPass Lead from Sunny</h2>
                <p><strong>name:</strong> ${leadData.full_name || "Not provided"}</p>
                <p><strong>email:</strong> ${leadData.email || "Not provided"}</p>
                <p><strong>phone:</strong> ${leadData.phone_optional || "Not provided"}</p>
                <p><strong>role:</strong> ${leadData.role || "Not provided"}</p>
                <p><strong>property address:</strong> ${leadData.property_address_optional || "Not provided"}</p>
                <p><strong>notes:</strong> ${leadData.notes || "Not provided"}</p>
                <p><strong>timestamp:</strong> ${timestampIso}</p>
                <p><strong>chat context:</strong><br>${recentContext || "Not available"}</p>
              `,
            }),
          });

          logSunPassLeadCapture({
            sessionId,
            email: leadData.email || "",
            phone: leadData.phone_optional || "",
            role: leadData.role || "",
          });

          logToSheetAsync({
            type: "sunpass_lead",
            timestamp: timestampIso,
            session_id: sessionId,
            full_name: leadData.full_name || "",
            email: leadData.email || "",
            phone: leadData.phone_optional || "",
            role: leadData.role || "",
            property_address: leadData.property_address_optional || "",
            notes: leadData.notes || "",
          });

        } catch (sunpassErr) {
          console.error("[SUNPASS] lead submission failed", sunpassErr);
        }

        return respondWithLoggedReply(
          "Perfect. Your SunPass lead is confirmed and our team will reach out soon. If you want I can also answer any SunPass questions right here.",
          {
            ...currentState,
            sunpassLeadActive: false,
            sunpassLeadData: {},
            sunpassLastAskedField: undefined,
            sunpassAwaitingConfirmation: false,
          }
        );
      }

      return respondWithLoggedReply(
        "Thanks. Please reply YES to confirm your SunPass lead details, or tell me what to change.",
        currentState
      );
    }

    if (detectSunPassTopic(messageLower)) {
      const selectedAudience = detectSunPassAudience(messageLower);
      if (selectedAudience) {
        return respondWithLoggedReply(getSunPassAudienceResponse(selectedAudience), {
          ...currentState,
          activeConversationState: "sunpass_followup",
          sunpassQuickReplies: undefined,
        });
      }

      if (detectSunPassLeadIntent(messageLower, sunpassIntentPhrases)) {
        const leadData: Record<string, string> = {};
        for (const [roleKey, rolePattern] of Object.entries(SUNPASS_ROLE_PATTERNS)) {
          if (rolePattern.test(message)) {
            leadData.role = roleKey;
            break;
          }
        }
        const firstField =
          sunpassLeadFields.find((field) => !isOptionalLeadField(field)) || "full_name";
        return respondWithLoggedReply(
          "Absolutely. I can get a SunPass specialist to reach out. Please share your full name to get started.",
          {
            ...currentState,
            sunpassLeadActive: true,
            sunpassLeadData: leadData,
            sunpassLastAskedField: firstField,
            sunpassAwaitingConfirmation: false,
          }
        );
      }

      return respondWithLoggedReply(SUNPASS_ROLE_PROMPT, {
        ...currentState,
        activeConversationState: "sunpass_role_prompt",
        sunpassQuickReplies: SUNPASS_ROLE_QUICK_REPLIES,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 1A: SOLAR PANEL QUOTING STATE MACHINE
    // ──────────────────────────────────────────────────────────────

    const solarQuoteInProgress = currentState.intent === "solar_cleaning";
    const solarMentioned = /solar|panel/i.test(message);
    const quoteNotYetReady = !currentState.quoteReady && !currentState.confirmed;

    if ((solarQuoteInProgress || solarMentioned) && quoteNotYetReady) {
      const state: BookingState = { ...currentState, intent: "solar_cleaning" };
      const lastAsked = state.lastAskedField as QuoteField | undefined;

      if (lastAsked === "quoteAddress" && message.length > 5) {
        state.quoteAddress = message.trim();
        if (!state.address) state.address = message.trim();
      } else if (lastAsked === "panelCount") {
        const count = parsePanelCount(message, true);
        if (count) {
          state.panelCount = count;
        } else {
          return respondWithLoggedReply(
            "I need the exact panel count to prepare an accurate quote. Do you know how many panels your system has, or would you like to estimate based on your system size in kilowatts?",
            state
          );
        }
      } else if (lastAsked === "quoteStorey") {
        const storey = parseStorey(message);
        if (storey) state.quoteStorey = storey;
      } else if (lastAsked === "quoteLastCleaned") {
        const lc = parseLastCleaned(message);
        if (lc) state.quoteLastCleaned = lc;
      }

      if (!state.panelCount) {
        const count = parsePanelCount(message, false);
        if (count) state.panelCount = count;
      }

      const nextField = getNextQuoteField(state);

      if (nextField) {
        state.lastAskedField = nextField;
        return respondWithLoggedReply(QUOTE_QUESTIONS[nextField], state);
      }

      const { price, lichenNote, overMax } = buildFinalQuote(state);

      if (overMax || price === null) {
        state.quoteReady = false;
        return respondWithLoggedReply(
          "That system size requires a custom quote. I'll have Aaron reach out to review the details with you. Can I get your name and best contact number?",
          state
        );
      }

      state.price = price;
      state.quoteReady = true;
      state.lichenSurchargeApplied = lichenNote;
      state.lastAskedField = undefined;

      let quoteMsg = `The total for cleaning ${state.panelCount} solar panels at ${state.quoteAddress} is $${price}.`;
      if (lichenNote) {
        quoteMsg +=
          " Please note: if there is heavy lichen present, there will be an additional $2 per panel charge due to the increased time required to remove it.";
      }
      quoteMsg += " Would you like to proceed with booking?";

      return respondWithLoggedReply(quoteMsg, state);
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 1B: ROOF WASH QUOTING STATE MACHINE
    // ──────────────────────────────────────────────────────────────

    const roofWashInProgress = currentState.roofWashIntent === true;
    const roofWashMentioned = /roof|wash|pressure wash|soft wash/i.test(message) &&
      !/solar|panel/i.test(message);
    const roofQuoteNotReady = !currentState.roofQuoteReady && !currentState.confirmed;

    if ((roofWashInProgress || roofWashMentioned) && roofQuoteNotReady) {
      const state: BookingState = { ...currentState, roofWashIntent: true };
      const lastAsked = state.roofLastAskedField as RoofQuoteField | undefined;

      // If this is the very first time we're entering the roof wash flow, announce the questions
      const isFirstEntry = !roofWashInProgress;

      // Parse the answer to whatever we last asked
      if (lastAsked === "roofSqft") {
        const sqft = parseRoofSqft(message);
        if (sqft) {
          state.roofSqft = sqft;
        } else {
          return respondWithLoggedReply(
            "I need the roof square footage to calculate your quote. What is the approximate square footage of your roof?",
            state
          );
        }
      } else if (lastAsked === "roofStorey") {
        const storey = parseStorey(message);
        if (storey) {
          state.roofStorey = storey;
        } else {
          return respondWithLoggedReply(
            "Is your home one story or two stories?",
            state
          );
        }
      } else if (lastAsked === "roofLastCleaned") {
        const lc = parseRoofLastCleaned(message);
        if (lc) {
          state.roofLastCleaned = lc;
        } else {
          return respondWithLoggedReply(
            "When was the last time you had your roof professionally cleaned?",
            state
          );
        }
      } else if (lastAsked === "roofStreaking") {
        const yn = parseYesNo(message);
        if (yn !== null) {
          state.roofStreaking = yn;
        } else {
          return respondWithLoggedReply(
            "Is there any visible streaking or buildup of organic material on your roof? A simple yes or no works.",
            state
          );
        }
      } else if (lastAsked === "roofLichen") {
        const yn = parseYesNo(message);
        if (yn !== null) {
          state.roofLichen = yn;
        } else {
          return respondWithLoggedReply(
            "Do you notice any white, grey, or greenish crusty patches on your roof? A simple yes or no works.",
            state
          );
        }
      } else if (lastAsked === "roofQuoteAddress") {
        if (message.length > 5) {
          state.roofQuoteAddress = message.trim();
          if (!state.address) state.address = message.trim();
        }
      }

      // Determine next field needed
      const nextField = getRoofNextField(state);

      if (nextField) {
        state.roofLastAskedField = nextField;

        // Announce question count on first entry
        if (isFirstEntry) {
          return respondWithLoggedReply(
            `I have 6 quick questions for you and then I can give you a quote.\n\n1. ${ROOF_QUOTE_QUESTIONS[nextField]}`,
            state
          );
        }

        return respondWithLoggedReply(ROOF_QUOTE_QUESTIONS[nextField], state);
      }

      // All fields collected — build the quote
      const finalPrice = buildRoofQuote(state);
      state.roofQuoteReady = true;
      state.roofQuotePrice = finalPrice;
      state.roofLastAskedField = undefined;

      // Build plain-English condition description for output
      let conditionDesc = "good condition";
      if (state.roofLastCleaned === "never" || (state.roofLastCleaned === "gt2" && state.roofStreaking)) {
        conditionDesc = "significant buildup noted";
      } else if (state.roofLastCleaned === "gt2" || state.roofStreaking) {
        conditionDesc = "moderate buildup noted";
      }

      const storeyDesc = state.roofStorey === "2" ? "two-story" : "one-story";
      const lichenDesc = state.roofLichen ? " · lichen present" : "";

      const quoteMsg = `Based on what you've shared, here's your estimate:

${state.roofSqft?.toLocaleString()} sq ft roof · ${storeyDesc} · ${conditionDesc}${lichenDesc}

Estimated Total: $${finalPrice.toLocaleString()}

Based on this pricing, would you like to schedule your roof cleaning?`;

      return respondWithLoggedReply(quoteMsg.trim(), state);
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2A: ROOF WASH BOOKING FLOW
    // ──────────────────────────────────────────────────────────────

    const roofQuotePrice = typeof currentState.roofQuotePrice === "number" ? currentState.roofQuotePrice : undefined;

    if (currentState.roofQuoteReady && typeof roofQuotePrice === "number" && !currentState.confirmed) {
      let reply = "";
      let state: BookingState = {
        ...currentState,
        // Pre-fill address from roof quote address — never ask again
        address: currentState.address || currentState.roofQuoteAddress,
      };

      // Parse any field answers from the current message
      if (state.roofLastAskedField && message.trim()) {
        const field = state.roofLastAskedField;
        if (field === "full name") state.fullName = message.trim();
        else if (field === "email address" && message.includes("@")) state.email = message.trim();
        else if (field === "phone number") state.phone = message.trim();
        else if (field === "preferred date and time") state.dateTime = message.trim();
      }

      // Also try AI extraction for any fields mentioned naturally
      const roofParsePrompt = `
You are extracting structured data from a user's message and recent conversation history.
Return ONLY valid JSON with these exact keys (null if not found/unclear):
{
  "full_name": string or null,
  "email": string (must contain @) or null,
  "phone_number": string or null,
  "preferred_date_time": string or null
}

Recent conversation history (most recent first):
${JSON.stringify(body.messages?.slice(-6).reverse() || [], null, 2)}

Current user message: "${message}"

Do not add explanations, do not wrap in code block, output pure JSON only.
`;

      try {
        const parseCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: roofParsePrompt }],
          temperature: 0.0,
          max_tokens: 150,
        });
        let extractedText = parseCompletion.choices[0]?.message?.content?.trim() || "{}";
        extractedText = extractedText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
        const extracted = JSON.parse(extractedText);
        if (extracted.full_name && !state.fullName) state.fullName = extracted.full_name;
        if (extracted.email && extracted.email.includes("@") && !state.email) state.email = extracted.email;
        if (extracted.phone_number && !state.phone) state.phone = extracted.phone_number;
        if (extracted.preferred_date_time && !state.dateTime) state.dateTime = extracted.preferred_date_time;
      } catch (parseErr) {
        console.error("Roof field extraction failed:", parseErr);
      }

      // Determine missing fields — email is required, rest are collected but not hard-gated
      const roofMissing: string[] = [];
      if (!state.email) roofMissing.push("email address");
      if (!state.fullName) roofMissing.push("full name");
      if (!state.phone) roofMissing.push("phone number");
      if (!state.dateTime) roofMissing.push("preferred date and time");

      if (roofMissing.length > 0) {
        const nextField = roofMissing[0];
        state.roofLastAskedField = nextField;
        const name = state.fullName ? ` ${state.fullName.split(" ")[0]}` : "";
        // Extra note on email since it's required
        const emailNote = nextField === "email address" ? " — we need this to send your confirmation" : "";
        const templates = [
          `Thanks${name}. What is your ${nextField}${emailNote}?`,
          `Got it${name}. Please share your ${nextField}${emailNote}.`,
          `I have that noted${name}. What is your ${nextField}${emailNote}?`,
        ];
        reply = templates[Math.floor(Math.random() * templates.length)];

      } else if (!state.referralSubmitted && !state.awaitingReferral && !state.awaitingConfirmation) {
        state.awaitingReferral = true;
        reply = "One more thing before your summary — SunSweeper has a referral program. If you refer someone and they book service you'll receive a credit for 10% of their bill towards a future service (up to $500). No forms or links needed — just a name and phone number. Got someone in mind?";

      } else if (!state.awaitingConfirmation) {
        const summary = `Here's what I've got for your booking${state.fullName ? `, ${state.fullName}` : ""}:
- Name: ${state.fullName || "Not set"}
- Email: ${state.email || "Not set"}
- Phone: ${state.phone || "Not set"}
- Address: ${state.address || "Not set"}
- Date & Time: ${state.dateTime || "Not set"}
- Service: Roof wash — $${roofQuotePrice.toLocaleString()}

Does everything look correct? Reply YES to confirm, or tell me what to change.`;
        reply = summary.trim();
        state.awaitingConfirmation = true;
        state.awaitingReferral = false;
        state.roofLastAskedField = undefined;

      } else if (
        ["yes", "confirm", "book it", "go ahead", "sure", "okay", "yep", "yeah"].some((w) =>
          messageLower.includes(w)
        )
      ) {
        const fullName = state.fullName ?? "Customer";
        const email = state.email!;
        const phone = state.phone || "N/A";
        const address = state.address ?? state.roofQuoteAddress ?? "Not provided";
        const dateTime = state.dateTime ?? "To be confirmed";
        const priceStr = roofQuotePrice.toLocaleString();
        const referral = state.referralData;

        const referralSection = referral
          ? `<hr><p>Thank you for referring ${referral.firstName} ${referral.lastName}. We will reach out to them at ${referral.phone}. If we are able to book a service with them you will receive a 10% credit towards future services once we complete their booking.</p><p><strong>- Aaron, SunSweeper CEO</strong></p>`
          : "";

        const referralTextSection = referral
          ? `\nReferral: ${referral.firstName} ${referral.lastName}, ${referral.phone}`
          : "";

        logToSheetAsync({
          session_id: sessionId,
          type: "booking",
          known_name: fullName,
          phone,
          email,
          text: `Roof wash at ${address} on ${dateTime} — $${priceStr}`,
          service_key: "roof_wash",
          lead_detected: true,
        });

        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.sunsweeper.com";
          console.log("[ROOF-BOOKING] Attempting email send to", email, "from", baseUrl);

          const emailRes = await fetch(`${baseUrl}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [email, "aaron@sunsweeper.com"],
              subject: `SunSweeper Roof Wash Booking - ${dateTime}`,
              html: `
                <h2>Booking Confirmed!</h2>
                <p>Hi ${fullName},</p>
                <p>Your roof wash at ${address} is scheduled for ${dateTime}.</p>
                <p>Estimated Total: $${priceStr}</p>
                <p>Phone: ${phone}</p>
                <p>We'll confirm the final price once we've had a chance to measure the roof. Questions? Reply or call.</p>
                <hr>
                <h3>Referral Program</h3>
                <p>If you ever send someone our way and they end up using us, we'll put a credit on your account for 10% of their job (up to $500). No forms needed — just have them mention your name.</p>
                ${referralSection}
                <hr>
                <p><small>Copy for Aaron - new roof wash booking logged.</small></p>
              `,
              text: `Roof Wash Booking: ${fullName}, $${priceStr}, ${dateTime} at ${address}. Phone: ${phone}${referralTextSection}`,
            }),
          });

          const emailResult = await emailRes.json();
          console.log("[ROOF-BOOKING] Email result:", emailResult);

          if (emailResult.ok) {
            reply = `Your roof wash is booked, ${fullName.split(" ")[0]}. A confirmation has been sent to ${email}. We have you down for ${dateTime}. If anything changes, just reach out.`;
          } else {
            reply = "Your booking is confirmed. I had an issue sending the confirmation email but Aaron will follow up with you directly.";
            console.error("Roof booking email failed:", emailResult.error);
          }

          state = { ...state, confirmed: true, awaitingConfirmation: false };

        } catch (err) {
          reply = "Your roof wash booking is noted. I hit a snag on the confirmation email — Aaron will follow up to get this finalized.";
          state = { ...state, confirmed: true, awaitingConfirmation: false };
          console.error("Roof booking email error:", err);
        }

      } else {
        reply = "Quick confirmation: does everything look correct? Reply YES to confirm, or tell me what to update.";
      }

      return respondWithLoggedReply(reply, state);
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2B: SOLAR BOOKING FLOW
    // ──────────────────────────────────────────────────────────────

    const hasPanelCount = typeof currentState.panelCount === "number";
    const price = typeof currentState.price === "number" ? currentState.price : undefined;

    if (
      hasPanelCount &&
      typeof price === "number" &&
      currentState.quoteReady &&
      !currentState.roofQuoteReady &&
      !currentState.confirmed
    ) {
      let reply = "";
      let state = { ...currentState };

      if (state.lastAskedField && message.trim()) {
        const field = state.lastAskedField;
        if (field === "full name") state.fullName = message.trim();
        else if (field === "email address" && message.includes("@"))
          state.email = message.trim();
        else if (field === "phone number") state.phone = message.trim();
        else if (field === "full service address (street, city, zip)")
          state.address = message.trim();
        else if (field === "preferred date and time") state.dateTime = message.trim();
      }

      const parsePrompt = `
You are extracting structured data from a user's message and recent conversation history.
Return ONLY valid JSON with these exact keys (null if not found/unclear):
{
  "full_name": string or null,
  "email": string (must contain @) or null,
  "phone_number": string or null,
  "full_address": string (street, city, zip format) or null,
  "preferred_date_time": string or null
}

Recent conversation history (most recent first):
${JSON.stringify(body.messages?.slice(-6).reverse() || [], null, 2)}

Current user message: "${message}"

Do not add explanations, do not wrap in code block, output pure JSON only.
`;

      try {
        const parseCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: parsePrompt }],
          temperature: 0.0,
          max_tokens: 150,
        });

        let extractedText =
          parseCompletion.choices[0]?.message?.content?.trim() || "{}";
        extractedText = extractedText
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
          .trim();

        const extracted = JSON.parse(extractedText);
        if (extracted.full_name && !state.fullName) state.fullName = extracted.full_name;
        if (extracted.email && extracted.email.includes("@") && !state.email)
          state.email = extracted.email;
        if (extracted.phone_number && !state.phone) state.phone = extracted.phone_number;
        if (extracted.full_address && !state.address) state.address = extracted.full_address;
        if (extracted.preferred_date_time && !state.dateTime)
          state.dateTime = extracted.preferred_date_time;
      } catch (parseErr) {
        console.error("Field extraction failed:", parseErr);
      }

      const missing: string[] = [];
      if (!state.fullName) missing.push("full name");
      if (!state.email) missing.push("email address");
      if (!state.phone) missing.push("phone number");
      if (!state.address) missing.push("full service address (street, city, zip)");
      if (!state.dateTime) missing.push("preferred date and time");

      if (missing.length > 0) {
        const nextField = missing[0];
        state.lastAskedField = nextField;
        const name = state.fullName ? ` ${state.fullName.split(" ")[0]}` : "";
        const templates = [
          `Thanks${name}. Please share your ${nextField} so I can keep your booking moving.`,
          `Great${name} — what is your ${nextField}?`,
          `I have that noted${name}. Please provide your ${nextField}.`,
          `We're almost done with intake${name}. What is your ${nextField}?`,
        ];
        reply = templates[Math.floor(Math.random() * templates.length)];

      } else if (!state.referralSubmitted && !state.awaitingReferral && !state.awaitingConfirmation) {
        state.awaitingReferral = true;
        reply = "One more thing before your summary — SunSweeper has a referral program. If you refer someone and they book service you'll receive a credit for 10% of their bill towards a future service (up to $500). No forms or links needed — just a name and phone number. Got someone in mind?";

      } else if (!state.awaitingConfirmation) {
        const summary = `
Here's what I've got for your booking${state.fullName ? `, ${state.fullName}` : ""}:
- Name: ${state.fullName || "Not set"}
- Email: ${state.email || "Not set"}
- Phone: ${state.phone || "Not set"}
- Address: ${state.address || "Not set"}
- Date & Time: ${state.dateTime || "Not set"}
- Service: Cleaning ${state.panelCount} solar panels for $${price.toFixed(2)}

Does everything look correct before I lock this in? Reply YES to confirm, or tell me what to change.`;
        reply = summary.trim();
        state.awaitingConfirmation = true;
        state.awaitingReferral = false;
        state.lastAskedField = undefined;

      } else if (
        ["yes", "confirm", "book it", "go ahead", "sure", "okay", "yep", "yeah"].some((w) =>
          messageLower.includes(w)
        )
      ) {
        const fullName = state.fullName!;
        const email = state.email!;
        const phone = state.phone || "N/A";
        const address = state.address!;
        const dateTime = state.dateTime!;
        const panelCount = state.panelCount!;
        const priceStr = price.toFixed(2);
        const referral = state.referralData;

        const referralSection = referral
          ? `
            <hr>
            <p>Thank you for referring ${referral.firstName} ${referral.lastName}. We will reach out to them at ${referral.phone}. If we are able to book a service with them you will receive a 10% credit towards future services once we complete their booking. Once again, thank you for the referral.</p>
            <p><strong>- Aaron, SunSweeper CEO</strong></p>
          `
          : "";

        const referralTextSection = referral
          ? `\nReferral: ${referral.firstName} ${referral.lastName}, ${referral.phone}`
          : "";

        logToSheetAsync({
          session_id: sessionId,
          type: "booking",
          known_name: fullName,
          phone: phone,
          email: email,
          text: `${panelCount} panels at ${address} on ${dateTime} — $${priceStr}`,
          service_key: "solar_cleaning",
          lead_detected: true,
        });

        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.sunsweeper.com";
          console.log("[BOOKING] Attempting email send to", email, "from", baseUrl);

          const emailRes = await fetch(`${baseUrl}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [email, "aaron@sunsweeper.com"],
              subject: `SunSweeper Booking Confirmation - ${dateTime}`,
              html: `
                <h2>Booking Confirmed!</h2>
                <p>Hi ${fullName},</p>
                <p>Your solar panel cleaning for ${panelCount} panels at ${address} is scheduled for ${dateTime}.</p>
                <p>Total: $${priceStr}</p>
                <p>Phone: ${phone}</p>
                <p>We'll see you then! Questions? Reply or call.</p>
                <hr>
                <h3>Referral Program</h3>
                <p>If you ever send someone our way and they end up using us, we'll put a credit on your account for 10% of their job (up to $500). You can use that toward any future service.</p>
                <p>No forms or links needed — if they mention your name when booking, we'll take care of the rest.</p>
                ${referralSection}
                <hr>
                <p><small>Copy for Aaron - new booking logged.</small></p>
              `,
              text: `Booking Confirmed: ${fullName}, ${panelCount} panels, $${priceStr}, ${dateTime} at ${address}${referralTextSection}\n\nReferral Program: If you send someone our way and they book, we'll credit 10% of their job (up to $500) to your account. No forms needed — just have them mention your name.`,
            }),
          });

          const emailResult = await emailRes.json();
          console.log("[BOOKING] Email result:", emailResult);

          if (emailResult.ok) {
            reply = `Great — your booking request is confirmed, ${fullName.split(" ")[0]}. A confirmation email has been sent to ${email}. We have you scheduled for ${dateTime}. If anything needs to be updated, just let me know.`;
          } else {
            reply =
              "Your booking is confirmed. I ran into an issue sending the confirmation email but Aaron will follow up with you directly.";
            console.error("Email send failed:", emailResult.error);
          }

          state = { ...state, confirmed: true, awaitingConfirmation: false };

        } catch (err) {
          reply =
            "Your booking is noted. I hit an issue while sending the confirmation email — Aaron will follow up to get this completed.";
          state = { ...state, confirmed: true, awaitingConfirmation: false };
          console.error("Email trigger error:", err);
        }
      } else {
        reply =
          "Quick confirmation: does everything look correct? Reply YES to confirm, or tell me what to update.";
      }

      return respondWithLoggedReply(reply, state);
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 3: Fallback to OpenAI with full personality + history
    // ──────────────────────────────────────────────────────────────

    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: SUNNY_SYSTEM_PROMPT },
      ...(offerHandoff
        ? [
            {
              role: "system" as const,
              content:
                "The user appears frustrated. Briefly offer a live-person option in a confident, supportive tone. Keep it short and do not over-apologize.",
            },
          ]
        : []),
      ...(body.messages || [])
        .slice(-8)
        .map(
          (m) =>
            ({
              role: m.role as "user" | "assistant",
              content: m.content,
            } as ChatCompletionMessageParam)
        ),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      temperature: 1.0,
      max_tokens: 280,
      presence_penalty: 0.4,
      frequency_penalty: 0.2,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "I ran into an issue processing that — please try again.";

    const state = { ...currentState };

    return respondWithLoggedReply(reply, state.confirmed ? { confirmed: true } : state);
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
