import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

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
  awaitingConfirmation?: boolean;
  intent?: string;
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
            const reply = `The total cost for cleaning ${panelCount} solar panels is $${price.toFixed(
              2
            )}. Would you like to schedule this cleaning?`;
            console.log("FORCED TABLE PRICE -", panelCount, "→", price);

            currentState = {
              ...currentState,
              panelCount,
              price,
              intent: "pricing_quote",
            };

            return NextResponse.json({ reply, state: currentState });
          }
        } catch (err) {
          console.error("Pricing load error:", err);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Run sunnyRuntime
    // ──────────────────────────────────────────────────────────────
    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(rawMessage, currentState);
    let reply = runtimeResult.reply;
    let state = runtimeResult.state as BookingState;

    // ──────────────────────────────────────────────────────────────
    // STEP 3: Prioritize custom booking logic (after runtime, but override if needed)
    // ──────────────────────────────────────────────────────────────
    // Merge runtime state back into currentState to preserve panelCount/price
    state = { ...currentState, ...state };

    const hasPanelCount = typeof state.panelCount === "number";
    const price = typeof state.price === "number" ? state.price : undefined;

    if (hasPanelCount && typeof price === "number" && !state.confirmed) {
      const missing: string[] = [];
      if (!state.fullName) missing.push("full name");
      if (!state.email) missing.push("email address");
      if (!state.address) missing.push("full service address (street, city, zip)");
      if (!state.dateTime) missing.push("preferred date and time");

      if (missing.length > 0) {
        const nextField = missing[0];
        reply = `Awesome! To book the ${state.panelCount}-panel cleaning for $${price.toFixed(
          2
        )}, I just need your ${nextField}. What's that?`;
      } else if (!state.awaitingConfirmation) {
        const summary = `
Here's what I have for the booking:
- Name: ${state.fullName || "Not set"}
- Email: ${state.email || "Not set"}
- Phone: ${state.phone || "Not provided"}
- Address: ${state.address || "Not set"}
- Date & Time: ${state.dateTime || "Not set"}
- Service: Cleaning ${state.panelCount} solar panels for $${price.toFixed(2)}

Does everything look correct? Reply YES to confirm and book, or tell me what needs to change.
        `.trim();

        reply = summary;
        state = { ...state, awaitingConfirmation: true };
      } else if (
        ["yes", "confirm", "book it", "go ahead", "sure", "okay"].some((w) =>
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
          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000";

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

          const emailResult = (await emailRes.json()) as {
            ok?: boolean;
            error?: unknown;
          };

          if (emailResult.ok) {
            reply = `All set! Your booking is confirmed. Confirmation email sent to ${email} and to me (Aaron). We'll follow up if needed. Thanks! 🌞`;
            state = { ...state, confirmed: true, awaitingConfirmation: false };
          } else {
            reply =
              "Something went wrong sending the confirmation—I'll have Aaron reach out to finalize. Sorry about that!";
            console.error("Email send failed:", emailResult.error);
          }
        } catch (err) {
          reply =
            "Hmm, booking hit a snag on our end. Aaron will get in touch to sort it out.";
          console.error("Email trigger error:", err);
        }
      } else {
        reply = "Just to make sure, does the summary look correct? Reply YES to book, or tell me what to fix.";
      }

      return NextResponse.json({ reply, state });
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 4: Force deterministic reply for known paths
    // ──────────────────────────────────────────────────────────────
    if (state.intent === "booking_request" || state.confirmed) {
      console.log("FORCING DETERMINISTIC REPLY — booking/confirmed");
      return NextResponse.json({ reply, state });
    }

    if (state.intent === "pricing_quote" || (reply.includes("panels") && reply.includes("$"))) {
      console.log("FORCING DETERMINISTIC REPLY — pricing");
      return NextResponse.json({ reply, state });
    }

    return NextResponse.json({ reply, state });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
