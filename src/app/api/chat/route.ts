import crypto from "crypto";
import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

/**
 * IMPORTANT:
 * - Solar quote totals MUST come from: data/pricing/solar-pricing-v1.json
 * - All solar pricing + booking flow is handled inside createSunnyRuntime.
 */

const SYSTEM_PROMPT = `# Sunny Agent Instructions
## Role
Sunny is the conversational interface for SunSweeper...
(Be chill, fun, and follow the user's lead. Only mention SunSweeper services if the user asks...)
## Solar Panel Cleaning Pricing (Critical)
The ONLY pricing source for customer quotes is: data/pricing/solar-pricing-v1.json
... (keep your full SYSTEM_PROMPT here)
`;

const DEFAULT_SPREADSHEET_ID = "1HLQatzrYWDzUdh8WzKHCpxpucDBMYSuHB0pXI1-f3mw";
const DEFAULT_BOOKING_RANGE = "Sheet1!A:I";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_APPEND_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// (Keep all your helper functions: toBase64Url, createServiceAccountJwt, getGoogleAccessToken,
// appendSolarBookingToSheet, escapeHtml, buildBookingEmail, sendResendEmail, sendBookingConfirmationEmails)
// → Paste them here exactly as they were before

export const runtime = "nodejs";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log('🚨 [SUNNY-API-MARKER] /api/chat POST hit at', timestamp);

  try {
    const body = (await request.json()) as {
      message?: string;
      state?: Record<string, unknown>;
      messages?: Message[];
    };

    const message = body.message?.trim();
    console.log('🚨 [SUNNY-API-MARKER] Incoming message:', message?.substring(0, 100) || '(no message)');

    const previousState = body.state ?? {};
    const history = Array.isArray(body.messages) ? body.messages : [];

    if (!message) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: previousState }, { status: 400 });
    }

    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, previousState);
    const { state } = runtimeResult;
    let reply = runtimeResult.reply;

    // ──────────────────────────────────────────────────────────────
    // IMPORTANT DIAGNOSTIC
    // ──────────────────────────────────────────────────────────────
    console.log('🚨 RUNTIME STATE:', {
      intent: state.intent,
      serviceId: state.serviceId,
      outcome: state.outcome,
      needsHumanFollowup: state.needsHumanFollowup,
      replyPreview: reply.substring(0, 140)
    });

    // FORCE DETERMINISTIC REPLY FOR PRICING & BOOKING
    if (
      state.intent === 'pricing_quote' ||
      state.intent === 'booking_request' ||
      reply.toLowerCase().includes('panels') && reply.includes('$')
    ) {
      console.log('🚨 FORCING DETERMINISTIC REPLY — pricing/booking flow');

      // Run booking sync if needed
      if (
        state.outcome === "booked_job" &&
        state.serviceId === "solar_panel_cleaning" &&
        state.bookingRecord &&
        !state.bookingSynced
      ) {
        try {
          const bookingRecord = state.bookingRecord as SolarBookingRecord;
          await appendSolarBookingToSheet(bookingRecord);
          await sendBookingConfirmationEmails(bookingRecord);
          state.bookingSynced = true;
          state.bookingEmailSent = true;
          reply = `${reply} ✅ Your booking has been saved and your confirmation email is on the way.`;
        } catch (error) {
          console.error("Booking sync failed:", error);
        }
      }
      return NextResponse.json({ reply, state });
    }

    // Only reach here for general chat
    console.log('🚨 FALLING BACK TO OPENAI');
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state });
    }

    // ... (your existing OpenAI fallback code stays the same)
    const normalizedHistory = history
      .filter((entry): entry is Message => !!entry && (entry.role === "user" || entry.role === "assistant"))
      .map((entry) => ({ role: entry.role, content: entry.content }));

    const last = normalizedHistory[normalizedHistory.length - 1];
    if (!last || last.role !== "user" || last.content !== message) {
      normalizedHistory.push({ role: "user", content: message });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...normalizedHistory],
    });

    const openAiReply = completion.choices[0]?.message?.content?.trim() || SAFE_FAIL_MESSAGE;

    console.log('🚨 Returned OpenAI reply');
    return NextResponse.json({ reply: openAiReply, state });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
