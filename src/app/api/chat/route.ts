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
  // SunPass fields
  sunpassLeadActive?: boolean;
  sunpassLeadData?: Record<string, string>;
  sunpassLastAskedField?: string;
  sunpassAwaitingConfirmation?: boolean;
  activeConversationState?: "sunpass_intro" | "sunpass_followup";
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

const SERVER_LOG_WEBHOOK_URL = process.env.SUNNY_LOG_WEBHOOK_URL;
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
  if (messageLower.includes("sunpass")) return true;
  if (
    messageLower.includes("solar") &&
    /(real estate|home sale|escrow|buying|selling|agent)/.test(messageLower)
  ) {
    return true;
  }
  return false;
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

function buildSunPassAboutResponse(sunpass: SunPassData): string {
  const about = sunpass.about_chat_response;
  if (about) {
    return [about.intro, about.purpose, about.who_it_helps, about.what_it_includes, about.cta]
      .fil
