import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

import { SAFE_FAIL_MESSAGE } from "../../../sunnyRuntime"; // keep if needed

import { SUNNY_SYSTEM_PROMPT } from "../../prompts/sunny-system-prompt"; // path to your prompt file

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

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log("[SUNNY-API-MARKER] /api/chat POST hit at", timestamp);

  try {
    const body = (await request.json()) as {
      message?: string;
      state?: BookingState;
      messages?: Message[];
    };

    const rawMessage = body.message ?? "";
    const message = rawMessage.trim();
    const messageLower = message.toLowerCase();
    let currentState = body.state ?? {};
    console.log(
      "[SUNNY-API-MARKER] Incoming message:",
      message.substring(0, 100),
      "state keys:",
      Object.keys(currentState)
    );

    if (!message) {
      return NextResponse.json(
        { reply: SAFE_FAIL_MESSAGE, state: currentState },
        { status: 400 }
      );
    }

    // STEP 1: Force pricing lookup (UNCHANGED + added emoji)
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
            const reply = `The total cost for cleaning ${panelCount} solar panels is $${price.toFixed(
              2
            )}. Stoked to get those shining — want to lock in a time? 🌞`;
            console.log("FORCED TABLE PRICE -", panelCount, "→", price);

            currentState = {
              ...currentState,
              panelCount,
              price,
              intent: "pricing_quote",
              lastAskedField: undefined,
            };

            return NextResponse.json({ reply, state: currentState });
          }
        } catch (err) {
          console.error("Pricing load error:", err);
        }
      }
    }

    // STEP 2: Custom booking flow (enhanced with more Sunny flavor/variety)
    const hasPanelCount = typeof currentState.panelCount === "number";
    const price = typeof currentState.price === "number" ? currentState.price : undefined;

    if (hasPanelCount && typeof price === "number" && !currentState.confirmed) {
      let reply = "";
      let state = { ...currentState };

      // Save user response to last asked field
      if (state.lastAskedField && message.trim()) {
        const field = state.lastAskedField;
        if (field === "full name") {
          state.fullName = message.trim();
        } else if (field === "email address") {
          if (message.includes("@")) state.email = message.trim();
        } else if (field === "phone number") {
          state.phone = message.trim();
        } else if (field === "full service address (street, city, zip)") {
          state.address = message.trim();
        } else if (field === "preferred date and time") {
          state.dateTime = message.trim();
        }
        console.log("Saved field:", field, "value:", message.trim());
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
        const sunnyGreetings = [
          `Sweet${name}! You're killing this booking vibe 🌞`,
          `Nice one${name}! Let's keep that shine going ✨`,
          `Awesome${name}! You're making my day 😏`,
          `Gotcha${name}! Almost there 💦`,
          `Perfect${name}! Feeling the Central Coast energy 🍔`,
          `Cool${name}! Don't cloud up now — next up:`,
          `Stoked${name}! One more step to sparkling panels`,
          `Radical${name}! Let's lock this in`,
        ];
        const randomGreeting = sunnyGreetings[Math.floor(Math.random() * sunnyGreetings.length)];

        reply = `${randomGreeting} To get your ${state.panelCount}-panel cleaning booked for $${price.toFixed(
          2
        )}, I just need your ${nextField}. What's that, sunshine?`;
      } else if (!state.awaitingConfirmation) {
        const summary = `
Here's what I've got down for your booking${state.fullName ? `, ${state.fullName}` : ""}:
- Name: ${state.fullName || "Not set"}
- Email: ${state.email || "Not set"}
- Phone: ${state.phone || "Not set"}
- Address: ${state.address || "Not set"}
- Date & Time: ${state.dateTime || "Not set"}
- Service: Cleaning ${state.panelCount} solar panels for $${price.toFixed(2)}

All good? Just say YES to lock it in, or tell me what to tweak. No pressure, babe! 🌞`;
        reply = summary.trim();
        state = { ...state, awaitingConfirmation: true, lastAskedField: undefined };
      } else if (
        ["yes", "confirm", "book it", "go ahead", "sure", "okay", "yep", "yeah"].some((w) =>
          messageLower.includes(w)
        )
      ) {
        // your original email + sheet logic here (unchanged - paste it back in)
        // ... (keep the full try/catch block from your original code for email and sheet)

        // Updated success reply with more personality
        reply = `All set, ${fullName.split(" ")[0]}! Your booking is locked in like a perfect wave. Confirmation email sent to ${email} and to Aaron. We'll see you ${state.dateTime} — those panels are gonna shine brighter than a Santa Maria sunset! Any questions, just holler 🌞✨`;
        state = { ...state, confirmed: true, awaitingConfirmation: false };
      } else {
        reply = "Just to make sure, does the summary look correct? Reply YES to book, or tell me what to fix. We're almost there! 😏";
      }

      return NextResponse.json({ reply, state });
    }

    // STEP 3: Fallback to OpenAI with full personality (for casual chat after booking or non-pricing)
    const openaiMessages = [
      { role: "system", content: SUNNY_SYSTEM_PROMPT },
      ...(body.messages || []).slice(-10).map(m => ({ role: m.role, content: m.content })), // last 10 msgs for context
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      temperature: 1.0, // playful & varied
      max_tokens: 250,
    });

    let reply = completion.choices[0]?.message?.content?.trim() || "Oof, got a little foggy there... try again? 🌞";

    // Light local flavor injection
    if (Math.random() < 0.4) {
      const localAddOns = [
        " ...classic Orcutt dust, huh?",
        " ...you know how the 101 traffic gets!",
        " ...Righetti Warrior style!",
      ];
      reply += localAddOns[Math.floor(Math.random() * localAddOns.length)];
    }

    let state = { ...currentState };

    return NextResponse.json({ reply, state });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
