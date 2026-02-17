import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `...`; // ← Keep your existing SYSTEM_PROMPT here (unchanged)

// Add to SYSTEM_PROMPT if you want (optional, inside the string):
// ## Booking Collection
// When user wants to book after a quote:
// - Collect: full name, email, phone (optional), full address, preferred date/time
// - Ask one field at a time, naturally
// - Once all collected, summarize and ask for confirmation
// - Do not send emails yourself — the server handles that

// ──────────────────────────────────────────────────────────────
// POST HANDLER
// ──────────────────────────────────────────────────────────────
export const runtime = "nodejs";

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
  [key: string]: any;
};

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log('🚨 [SUNNY-API-MARKER] /api/chat POST hit at', timestamp);

  try {
    const body = (await request.json()) as {
      message?: string;
      state?: BookingState;
      messages?: Message[];
    };

    const message = body.message?.trim().toLowerCase() || "";
    const currentState = body.state ?? {};
    console.log('🚨 Incoming message:', message.substring(0, 100), 'state keys:', Object.keys(currentState));

    if (!body.message) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: currentState }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Force pricing lookup if panels mentioned
    // ──────────────────────────────────────────────────────────────
    const panelMatch = body.message.match(/(\d{1,3})\s*(?:solar\s*)?panels?/i);
    if (panelMatch) {
      const panelCount = parseInt(panelMatch[1], 10);
      if (panelCount >= 1 && panelCount <= 100) {
        try {
          const pricingPath = path.join(process.cwd(), 'src/data/pricing/solar-pricing-v1.json');
          const pricingTable = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
          const key = panelCount.toString();
          if (pricingTable[key] !== undefined) {
            const price = pricingTable[key];
            const reply = `The total cost for cleaning ${panelCount} solar panels is $${price.toFixed(2)}. Would you like to schedule this cleaning?`;
            console.log('🚨 FORCED TABLE PRICE -', panelCount, '→', price);

            return NextResponse.json({
              reply,
              state: { ...currentState, panelCount, price, intent: 'pricing_quote' }
            });
          }
        } catch (err) {
          console.error('🚨 Pricing load error:', err);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Handle booking collection & confirmation
    // ──────────────────────────────────────────────────────────────
    const runtimeInstance = createSunnyRuntime({ knowledgeDir: `${process.cwd()}/knowledge` });
    let runtimeResult = runtimeInstance.handleMessage(body.message, currentState);
    let reply = runtimeResult.reply;
    let state = runtimeResult.state as BookingState;

    // Booking flow logic (after quote)
    if (state.panelCount && state.price && !state.confirmed) {
      // Check if we have all required fields
      const missing = [];
      if (!state.fullName) missing.push("full name");
      if (!state.email) missing.push("email address");
      if (!state.address) missing.push("service address");
      if (!state.dateTime) missing.push("preferred date and time");

      if (missing.length > 0) {
        // Ask for the next missing field (natural language)
        const nextField = missing[0];
        reply = `Great! To book the ${state.panelCount}-panel cleaning for $${state.price.toFixed(2)}, I just need your ${nextField}. What's that?`;
      } else {
        // All collected → confirm
        const summary = `
Here's what I have:
- ${state.fullName}
- Email: ${state.email}
- Phone: ${state.phone || 'Not provided'}
- Address: ${state.address}
- Date/Time: ${state.dateTime}
- Service: ${state.panelCount} panels for $${state.price.toFixed(2)}

Does this look correct? Reply YES to confirm and book, or tell me what to change.
        `.trim();

        reply = summary;
        state = { ...state, awaitingConfirmation: true };
      }

      // User confirmed?
      if (state.awaitingConfirmation && ["yes", "confirm", "book it", "go ahead", "sure"].some(w => message.includes(w))) {
        // Trigger email send
        try {
          const emailRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [state.email, "aaron@sunsweeper.com"], // customer + you
              subject: `SunSweeper Booking Confirmation - ${state.dateTime}`,
              html: `
                <h2>Booking Confirmed!</h2>
                <p>Hi ${state.fullName},</p>
                <p>Your solar panel cleaning for ${state.panelCount} panels at ${state.address} is scheduled for ${state.dateTime}.</p>
                <p>Total: $${state.price.toFixed(2)}</p>
                <p>Phone: ${state.phone || 'N/A'}</p>
                <p>We'll see you then! Questions? Reply or call.</p>
                <hr>
                <p><small>Copy for Aaron - new booking logged.</small></p>
              `,
              text: `Booking Confirmed: ${state.fullName}, ${state.panelCount} panels, $${state.price.toFixed(2)}, ${state.dateTime} at ${state.address}`
            }),
          });

          const emailResult = await emailRes.json();

          if (emailResult.ok) {
            reply = `All set! Your booking is confirmed. Confirmation email sent to ${state.email} and to me (Aaron). We'll follow up if needed. Thanks! 🌞`;
            state = { ...state, confirmed: true, awaitingConfirmation: false };
          } else {
            reply = "Something went wrong sending the confirmation—I'll have Aaron reach out to finalize. Sorry about that!";
            console.error('Email send failed:', emailResult.error);
          }
        } catch (err) {
          reply = "Hmm, booking hit a snag on our end. Aaron will get in touch to sort it out.";
          console.error('Email trigger error:', err);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 3: Existing forcing guards (keep them)
    // ──────────────────────────────────────────────────────────────
    if (state.intent === 'booking_request' || state.confirmed) {
      console.log('🚨 FORCING DETERMINISTIC REPLY — booking/confirmed');
      return NextResponse.json({ reply, state });
    }

    if (state.intent === 'pricing_quote' || (reply.includes('panels') && reply.includes('$'))) {
      console.log('🚨 FORCING DETERMINISTIC REPLY — pricing');
      return NextResponse.json({ reply, state });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 4: Fallback to OpenAI only if needed
    // ──────────────────────────────────────────────────────────────
    console.log('🚨 FALLING BACK TO OPENAI');
    // ... (keep your existing OpenAI fallback code here unchanged)

    return NextResponse.json({ reply, state });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
