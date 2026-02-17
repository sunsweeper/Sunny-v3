import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────
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
- Ask for panel count if not provided
- Look up the exact panel count key in data/pricing/solar-pricing-v1.json
- Reply with the total only (no per-panel math shown unless asked)
- If panel count is outside supported range (1–100), escalate to a human

## Booking Collection
When user wants to book after a quote:
- Collect: full name, email, phone (optional), full address, preferred date and time
- Ask one field at a time, naturally
- Once all collected, summarize and ask for confirmation
- Do not send emails yourself — the server handles that

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
  awaitingConfirmation?: boolean;
  confirmed?: boolean;
  intent?: string;
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

    const message = body.message?.trim();
    const currentState = body.state ?? {};
    console.log('🚨 [SUNNY-API-MARKER] Incoming message excerpt:', 
      message ? message.substring(0, 100) : '(no message)',
      'at', timestamp
    );

    if (!message) {
      console.log('🚨 [SUNNY-API-MARKER] No message provided — returning 400');
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: currentState }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Force server-side pricing lookup if panel count detected
    // ──────────────────────────────────────────────────────────────
    const panelMatch = message.match(/(\d{1,3})\s*(?:solar\s*)?panels?/i);
    if (panelMatch) {
      const panelCount = parseInt(panelMatch[1], 10);
      console.log('🚨 Detected panel count in message:', panelCount);

      if (panelCount >= 1 && panelCount <= 100) {
        try {
          const pricingPath = path.join(process.cwd(), 'src/data/pricing/solar-pricing-v1.json');
          const pricingRaw = fs.readFileSync(pricingPath, 'utf8');
          const pricingTable = JSON.parse(pricingRaw);

          const key = panelCount.toString();
          if (pricingTable[key] !== undefined) {
            const price = pricingTable[key];
            const reply = `The total cost for cleaning ${panelCount} solar panels is $${price.toFixed(2)}. Would you like to schedule this cleaning?`;
            console.log('🚨 FORCED TABLE PRICE SUCCESS - panels:', panelCount, 'price:', price);

            return NextResponse.json({
              reply,
              state: { 
                ...currentState, 
                panelCount, 
                price, 
                intent: 'pricing_quote' 
              }
            });
          } else {
            console.log('🚨 Panel count not found in table:', panelCount);
          }
        } catch (err) {
          console.error('🚨 Failed to load pricing table:', err);
        }
      } else if (panelCount > 100) {
        return NextResponse.json({
          reply: `For ${panelCount} panels, I need to verify pricing and availability with Aaron — can you confirm the exact number or would you like him to reach out?`,
          state: currentState
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Run sunnyRuntime for other logic
    // ──────────────────────────────────────────────────────────────
    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, currentState);
    let { state, reply } = runtimeResult as { state: BookingState; reply: string };

    console.log('🚨 RUNTIME STATE:', {
      intent: state.intent,
      serviceId: state.serviceId,
      outcome: state.outcome,
      needsHumanFollowup: state.needsHumanFollowup,
      replyPreview: reply.substring(0, 140)
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3: Booking collection & email trigger logic
    // ──────────────────────────────────────────────────────────────
    if (state.panelCount && state.price && !state.confirmed) {
      const missing = [];
      if (!state.fullName) missing.push("full name");
      if (!state.email) missing.push("email address");
      if (!state.address) missing.push("full service address (street, city, zip)");
      if (!state.dateTime) missing.push("preferred date and time");

      if (missing.length > 0) {
        const nextField = missing[0];
        reply = `Awesome! To book the ${state.panelCount}-panel cleaning for $${state.price.toFixed(2)}, I just need your ${nextField}. What's that?`;
      } else if (!state.awaitingConfirmation) {
        // All fields collected → show summary & ask to confirm
        const summary = `
Here's what I have for the booking:
- Name: ${state.fullName}
- Email: ${state.email}
- Phone: ${state.phone || 'Not provided'}
- Address: ${state.address}
- Date & Time: ${state.dateTime}
- Service: Cleaning ${state.panelCount} solar panels for $${state.price.toFixed(2)}

Does everything look correct? Reply YES to confirm and book, or tell me what needs to change.
        `.trim();

        reply = summary;
        state = { ...state, awaitingConfirmation: true };
      } else if (["yes", "confirm", "book it", "go ahead", "sure", "okay"].some(word => message.toLowerCase().includes(word))) {
        // Confirmed → send email
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const emailResponse = await fetch(`${baseUrl}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: [state.email!, "aaron@sunsweeper.com"], // customer + owner
              subject: `SunSweeper Booking Confirmation - ${state.dateTime}`,
              html: `
                <h2>Booking Confirmed – SunSweeper Solar Cleaning</h2>
                <p>Hi ${state.fullName},</p>
                <p>Your cleaning for <strong>${state.panelCount!} solar panels</strong> at <strong>${state.address}</strong> is scheduled for <strong>${state.dateTime}</strong>.</p>
                <p><strong>Total:</strong> $${state.price!.toFixed(2)}</p>
                ${state.phone ? `<p><strong>Phone:</strong> ${state.phone}</p>` : ''}
                <p>We'll see you then! If anything changes, just reply or call.</p>
                <hr>
                <p style="font-size: 12px; color: #666;">This is a confirmation copy for Aaron.</p>
              `,
              text: `Booking Confirmed\n\nName: ${state.fullName}\nEmail: ${state.email}\nPhone: ${state.phone || 'N/A'}\nAddress: ${state.address}\nDate/Time: ${state.dateTime}\nService: ${state.panelCount!} panels - $${state.price!.toFixed(2)}`
            }),
          });

          const emailResult = await emailResponse.json();

          if (emailResult.ok) {
            reply = `All set! Your booking is confirmed. A confirmation email has been sent to ${state.email} and to me (Aaron). We'll follow up if needed. Thanks for choosing SunSweeper! 🌞`;
            state = { ...state, confirmed: true, awaitingConfirmation: false };
          } else {
            reply = "Something went wrong while sending the confirmation email — I'll have Aaron reach out to finalize everything manually. Sorry about that!";
            console.error('[booking] Email send failed:', emailResult.error);
          }
        } catch (err) {
          reply = "Hmm, we hit a snag processing the booking. Aaron will get in touch to sort it out shortly.";
          console.error('[booking] Email trigger error:', err);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 4: Force deterministic reply for known paths
    // ──────────────────────────────────────────────────────────────
    if (state.intent === 'booking_request' || state.confirmed) {
      console.log('🚨 FORCING DETERMINISTIC REPLY — booking/confirmed flow');
      return NextResponse.json({ reply, state });
    }

    if (state.intent === 'pricing_quote' || (reply.includes('panels') && reply.includes('$'))) {
      console.log('🚨 FORCING DETERMINISTIC REPLY — pricing flow');
      return NextResponse.json({ reply, state });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 5: Final fallback to OpenAI only if nothing matched
    // ──────────────────────────────────────────────────────────────
    console.log('🚨 FALLING BACK TO OPENAI');

    if (!process.env.OPENAI_API_KEY) {
      console.log('🚨 No OPENAI_API_KEY — returning safe fail');
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: currentState });
    }

    const normalizedHistory = (body.messages || [])
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
    return NextResponse.json({ reply: openAiReply, state: currentState });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
