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
  [key: string]: unknown;
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

async function writeConversationLog(entry: ConversationLogEntry) {
  console.log("[SUNNY-LOG]", JSON.stringify(entry));

  if (!SERVER_LOG_WEBHOOK_URL) {
    console.warn("[SUNNY-LOG] SUNNY_LOG_WEBHOOK_URL not set. Logging to console only.");
    return;
  }

  try {
    const response = await fetch(SERVER_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[SUNNY-LOG] webhook failed:", response.status, body.slice(0, 500));
    }
  } catch (error) {
    console.error("[SUNNY-LOG] webhook error:", error);
  }
}

async function logConversationTurn(payload: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const timestamp = new Date().toISOString();
  console.log("[SUNNY-LOG] logging conversation turn for session", payload.sessionId);

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

function logHandoffRequest(payload: {
  sessionId: string;
  contact: string;
  message: string;
}) {
  console.log(
    "[SUNNY-HANDOFF]",
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload })
  );
}

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log("[SUNNY-API-MARKER] /api/chat POST hit at", timestamp);

  try {
    const body = (await request.json()) as {
      message?: string;
      state?: BookingState;
      messages?: Message[];
      sessionId?: string;
    };

    const rawMessage = body.message ?? "";
    const message = rawMessage.trim();
    const messageLower = message.toLowerCase();
    let currentState = body.state ?? {};
    const sessionId = (body.sessionId || "anonymous").trim() || "anonymous";

    const respondWithLoggedReply = async (reply: string, state: BookingState, status = 200) => {
      await logConversationTurn({
        sessionId,
        userMessage: message || "[empty-message]",
        assistantMessage: reply,
      });
      return NextResponse.json({ reply, state }, { status });
    };

    const now = Date.now();
    const priorSessionState = sessionStateMap.get(sessionId) ?? getDefaultSessionState();
    let sessionState: SessionState = {
      ...priorSessionState,
      frustrationScore: Math.max(0, priorSessionState.frustrationScore - 1) + frustrationDelta(message),
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
        "Perfect — I can hand this to a live specialist. What’s the best phone number or email for them to reach you? 🌞",
        currentState
      );
    }

    if (sessionState.handoffActive) {
      if (sessionState.handoffCollecting === "contact") {
        sessionState.handoffContact = message;
        sessionState.handoffCollecting = "message";
        sessionStateMap.set(sessionId, sessionState);
        return respondWithLoggedReply(
          "Got it. Give me a short message about what you need help with, and I’ll pass it along.",
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
          "Done — I’ve sent your message to a live specialist. Someone from our team will follow up using your contact info soon. ✨",
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

    if (!message) {
      return respondWithLoggedReply(SAFE_FAIL_MESSAGE, currentState, 400);
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Force pricing lookup if panels mentioned
    // ──────────────────────────────────────────────────────────────
    const panelMatch = rawMessage.match(/(\d{1,3})\s*(?:solar\s*)?panels?/i);
    if (panelMatch) {
      const panelCount = parseInt(panelMatch[1], 10);
      if (panelCount >= 1 && panelCount <= 100) {
        try {
          const pricingPath = path.join(
            process.cwd(),
            "src/data/pricing/solar-pricing-v1.json"
          );
          const pricingTable = JSON.parse(
            fs.readFileSync(pricingPath, "utf8")
          ) as Record<string, number>;

          const key = panelCount.toString();

          if (pricingTable[key] !== undefined) {
            const price = pricingTable[key];
            const reply = `Boom — the total for cleaning ${panelCount} solar panels is $${price.toFixed(
              2
            )}. Those are gonna shine brighter than a Santa Maria sunset once we're done. Ready to book a time? 🌞`;
            console.log("FORCED TABLE PRICE -", panelCount, "→", price);

            currentState = {
              ...currentState,
              panelCount,
              price,
              intent: "pricing_quote",
              lastAskedField: undefined,
            };

            return respondWithLoggedReply(reply, currentState);
          }
        } catch (err) {
          console.error("Pricing load error:", err);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Smart booking flow with OpenAI extraction
    // ──────────────────────────────────────────────────────────────
    const hasPanelCount = typeof currentState.panelCount === "number";
    const price = typeof currentState.price === "number" ? currentState.price : undefined;

    if (hasPanelCount && typeof price === "number" && !currentState.confirmed) {
      let reply = "";
      let state = { ...currentState };

      // Try fast deterministic save first
      if (state.lastAskedField && message.trim()) {
        const field = state.lastAskedField;
        if (field === "full name") state.fullName = message.trim();
        else if (field === "email address" && message.includes("@")) state.email = message.trim();
        else if (field === "phone number") state.phone = message.trim();
        else if (field === "full service address (street, city, zip)") state.address = message.trim();
        else if (field === "preferred date and time") state.dateTime = message.trim();
      }

      // OpenAI extraction fallback (runs every time to catch out-of-order or repeated info)
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
          temperature: 0.0, // very deterministic
          max_tokens: 150,
        });

        let extractedText = parseCompletion.choices[0]?.message?.content?.trim() || "{}";
        // Clean up if wrapped in markdown/code
        extractedText = extractedText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

        const extracted = JSON.parse(extractedText);

        // Update state if better values found
        if (extracted.full_name && !state.fullName) state.fullName = extracted.full_name;
        if (extracted.email && extracted.email.includes("@") && !state.email) state.email = extracted.email;
        if (extracted.phone_number && !state.phone) state.phone = extracted.phone_number;
        if (extracted.full_address && !state.address) state.address = extracted.full_address;
        if (extracted.preferred_date_time && !state.dateTime) state.dateTime = extracted.preferred_date_time;

        console.log("OpenAI extracted:", extracted);
      } catch (parseErr) {
        console.error("Field extraction failed:", parseErr);
        // Continue with existing state
      }

      // Re-check missing after extraction
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
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

        reply = randomTemplate;
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

        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.sunsweeper.com";
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
                <p><small>Copy for Aaron - new booking logged.</small></p>
              `,
              text: `Booking Confirmed: ${fullName}, ${panelCount} panels, $${priceStr}, ${dateTime} at ${address}`,
            }),
          });

          const emailResult = await emailRes.json();
          console.log("[BOOKING] Email result:", emailResult);

          if (emailResult.ok) {
            try {
              const sheetRes = await fetch(
                "https://script.google.com/macros/s/AKfycbwXF31hUCdYh-9dzpf_hJT1-NWAv6Eerrr1Fj1mRxT6TA2ADllLR9e9fakEp80_ArUGLg/exec",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    Client_Name: fullName,
                    Address: address,
                    Panel_Count: panelCount,
                    Location: "Santa Maria",
                    Phone_number: phone,
                    email: email,
                    Requested_Date: dateTime.split(" at ")[0] || dateTime,
                    Time: dateTime.split(" at ")[1] || "N/A",
                    Booking_Timestamp: new Date().toISOString(),
                  }),
                }
              );

              const sheetResult = await sheetRes.json();
              console.log("[SHEET] Append result:", sheetResult);
            } catch (sheetErr) {
              console.error("Google Sheet append error:", sheetErr);
            }

            reply = `Great — your booking request is confirmed, ${fullName.split(" ")[0]}. A confirmation email has been sent to ${email}. We have you scheduled for ${dateTime}. If anything needs to be updated, just let me know.`;
            state = { ...state, confirmed: true, awaitingConfirmation: false };
          } else {
            reply = "I ran into an issue sending the confirmation email. Aaron will reach out to finalize your booking.";
            console.error("Email send failed:", emailResult.error);
          }
        } catch (err) {
          reply = "I hit an issue while finalizing the booking. Aaron will follow up to get this completed.";
          console.error("Email trigger error:", err);
        }
      } else {
        reply = "Quick confirmation: does everything look correct? Reply YES to confirm, or tell me what to update.";
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
      ...(body.messages || []).slice(-8).map(m => ({ role: m.role as "user" | "assistant", content: m.content }) as ChatCompletionMessageParam),
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

    const reply = completion.choices[0]?.message?.content?.trim() || "I ran into an issue processing that—please try again.";

    let state = { ...currentState };

    if (state.confirmed) {
      state = { confirmed: true };
    }

    return respondWithLoggedReply(reply, state);
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
