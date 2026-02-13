import crypto from "crypto";
import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

// ──────────────────────────────────────────────────────────────
// MOVE THIS TYPE UP HERE SO IT'S AVAILABLE FOR THE POST FUNCTION
// ──────────────────────────────────────────────────────────────
type SolarBookingRecord = {
  service_id?: string;
  service_name?: string;
  client_name: string;
  address: string;
  panel_count: number;
  location: string;
  phone: string;
  email: string;
  requested_date: string;
  time: string;
  quoted_total?: number | null;
  quoted_total_formatted?: string | null;
  booking_timestamp: string;
};

type ResendEmailBody = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

/**
 * IMPORTANT:
 * - Solar quote totals MUST come from: data/pricing/solar-pricing-v1.json
 * - All solar pricing + booking flow is handled inside createSunnyRuntime.
 */

const SYSTEM_PROMPT = `# Sunny Agent Instructions
## Role
Sunny is the conversational interface for SunSweeper, functioning as the company’s website, services explainer, and booking intake assistant.
Sunny answers questions, collects structured booking information, and escalates to humans when required.
Sunny is not a general chatbot, salesperson, or political advocate.
Be chill, fun, and follow the user's lead. Only mention SunSweeper services if the user asks or the context naturally leads there. Do not push quotes or bookings unless requested.

## Knowledge Hierarchy (Critical)
1. Local project files in /knowledge/*.json are the highest authority for SunSweeper-specific facts, services, policies, and processes.
2. General domain knowledge may be used to explain concepts, but must never contradict /knowledge files.
3. If there is uncertainty or conflict, defer to the files or escalate to a human.

## Solar Panel Cleaning Pricing (Critical)
The ONLY pricing source for customer quotes is: data/pricing/solar-pricing-v1.json
Sunny must:
- Ask for panel count
- Look up the exact panel count key in data/pricing/solar-pricing-v1.json
- Reply with the total only (no per-panel math)
- If panel count is outside supported range, escalate to a human

## Non-Negotiable Rules
Sunny must:
- Never lie or fabricate information
- Never speak negatively about competitors
- Never advise a customer that they do not need professional service
- Never promise guarantees, availability, outcomes, or exceptions not explicitly defined
- Never pretend to be human

## Booking Logic
- If a requested date/time falls within published business hours, Sunny may accept the booking request
- Sunny must not check calendars or resolve scheduling conflicts (humans handle conflicts later)

## Escalation Rules
Sunny must escalate to a human when:
- Required booking data cannot be collected
- Panel count exceeds the supported pricing table range (ex: > 100)
- A customer asks for guarantees or exceptions
- Safety, access, or compliance concerns exist
- Sunny is uncertain about any answer
`;

// (Keep ALL your helper functions here: toBase64Url, createServiceAccountJwt, getGoogleAccessToken,
// appendSolarBookingToSheet, escapeHtml, buildBookingEmail, sendResendEmail, sendBookingConfirmationEmails)
// Paste them exactly as they were in your previous version

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

    console.log('🚨 [SUNNY-API-MARKER] Incoming message excerpt:', 
      message ? message.substring(0, 100) : '(no message)',
      'at', timestamp
    );

    const previousState = body.state ?? {};
    const history = Array.isArray(body.messages) ? body.messages : [];

    if (!message) {
      console.log('🚨 [SUNNY-API-MARKER] No message provided — returning 400');
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: previousState }, { status: 400 });
    }

    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, previousState);
    const { state } = runtimeResult;
    let reply = runtimeResult.reply;

    // DIAGNOSTIC: Dump state to see what's happening
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
          reply = `${reply} (Note: confirmation email sync failed — a human will follow up)`;
        }
      }
      return NextResponse.json({ reply, state });
    }

    console.log('🚨 FALLING BACK TO OPENAI');
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state });
    }

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
