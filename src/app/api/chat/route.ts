import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

/**
 * IMPORTANT:
 * - Solar quote totals MUST come from: data/pricing/solar-pricing-v1.json
 * - This route should NOT reference any other pricing sources.
 * - All solar pricing + booking flow is handled inside createSunnyRuntime (which we cleaned up).
 *
 * This file’s job is:
 * 1) Run Sunny runtime first (deterministic, uses solar-pricing-v1.json)
 * 2) If it’s NOT a solar pricing/booking flow, fall back to OpenAI for general convo + service info
 * 3) On booked jobs, sync to Google Sheet + send emails
 */

// Removed references to public_pricing_reference / knowledge pricing.
// Also removed the ICE policy section from SYSTEM_PROMPT to avoid introducing political content.
// Sunny should not initiate political discussion; the runtime + prompts should stay business-focused.

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

const DEFAULT_SPREADSHEET_ID = "1HLQatzrYWDzUdh8WzKHCpxpucDBMYSuHB0pXI1-f3mw";
const DEFAULT_BOOKING_RANGE = "Sheet1!A:I";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_APPEND_URL = "https://sheets.googleapis.com/v4/spreadsheets";

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

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createServiceAccountJwt(serviceAccountEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

async function getGoogleAccessToken(serviceAccountEmail: string, privateKey: string) {
  const assertion = createServiceAccountJwt(serviceAccountEmail, privateKey);

  const tokenResponse = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`OAuth token request failed with status ${tokenResponse.status}`);
  }

  const tokenBody = (await tokenResponse.json()) as { access_token?: string };

  if (!tokenBody.access_token) {
    throw new Error("Google OAuth token response did not include an access token.");
  }

  return tokenBody.access_token;
}

async function appendSolarBookingToSheet(record: SolarBookingRecord) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!serviceAccountEmail || !privateKey) {
    throw new Error("Google Sheets credentials are not configured.");
  }

  const accessToken = await getGoogleAccessToken(serviceAccountEmail, privateKey);
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const range = encodeURIComponent(process.env.GOOGLE_SHEETS_BOOKING_RANGE || DEFAULT_BOOKING_RANGE);

  const appendResponse = await fetch(
    `${GOOGLE_SHEETS_APPEND_URL}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [
          [
            record.client_name,
            record.address,
            record.panel_count,
            record.location,
            record.phone,
            record.email,
            record.requested_date,
            record.time,
            record.booking_timestamp,
          ],
        ],
      }),
    }
  );

  if (!appendResponse.ok) {
    throw new Error(`Sheets append failed with status ${appendResponse.status}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBookingEmail(record: SolarBookingRecord) {
  const serviceName = record.service_name || "Solar Panel Cleaning";
  const total = record.quoted_total_formatted || "Pending final confirmation";
  const details: Array<[string, string]> = [
    ["Service", serviceName],
    ["Panel count", String(record.panel_count)],
    ["Quoted cost", total],
    ["Date", record.requested_date],
    ["Time", record.time],
    ["Service address", record.address],
    ["Panel location", record.location],
    ["Customer name", record.client_name],
    ["Customer phone", record.phone],
    ["Customer email", record.email],
  ];

  const htmlRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #ddd;"><strong>${escapeHtml(
          label
        )}</strong></td><td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  const text = ["Booking Confirmation - SunSweeper", "", ...details.map(([l, v]) => `${l}: ${v}`)].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h2 style="margin:0 0 12px;">SunSweeper Booking Confirmation</h2>
      <p style="margin:0 0 16px;">Thanks for booking with SunSweeper. Here are your appointment details:</p>
      <table style="border-collapse:collapse;border:1px solid #ddd;">
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  `;

  return { html, text };
}

async function sendResendEmail(body: ResendEmailBody) {
  const apiKey = process.env.resend_api_key || process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend API key is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend email request failed with status ${response.status}: ${responseText}`);
  }
}

async function sendBookingConfirmationEmails(record: SolarBookingRecord) {
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const { html, text } = buildBookingEmail(record);
  const appointmentLabel = `${record.requested_date} at ${record.time}`;

  await sendResendEmail({
    from,
    to: [record.email],
    subject: `SunSweeper Booking Confirmation (${appointmentLabel})`,
    html,
    text,
  });

  await sendResendEmail({
    from,
    to: ["info@sunsweeper.com"],
    subject: `New SunSweeper Booking - ${record.client_name}`,
    html,
    text,
  });
}

/**
 * DEBUG: prove the server can see and parse the pricing file at runtime,
 * and prove what 28 panels maps to.
 *
 * This does NOT change pricing behavior; it only logs facts so we can stop guessing.
 */
function debugLoadSolarPricing() {
  const relPath = "data/pricing/solar-pricing-v1.json";
  const absPath = path.join(process.cwd(), relPath);

  console.log("========== PRICING DEBUG ==========");
  console.log("cwd:", process.cwd());
  console.log("attempting to load:", absPath);
  console.log("file exists:", fs.existsSync(absPath));

  if (!fs.existsSync(absPath)) {
    throw new Error(`[PRICING] Missing pricing file at: ${absPath}`);
  }

  const raw = fs.readFileSync(absPath, "utf8");
  const json = JSON.parse(raw);

  const tiers = Array.isArray(json?.panel_tiers) ? json.panel_tiers : [];
  const sanity28 = tiers.find((t: any) => t?.min === 28 && t?.max === 28);

  console.log("sanity check (28 panels):", sanity28);
  console.log("pricing keys:", Object.keys(json || {}));
  console.log("panel_tiers length:", tiers.length);
  console.log("===================================");

  return json;
}

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      state?: Record<string, unknown>;
      messages?: Message[];
    };

    const message = body.message?.trim();
    const previousState = body.state ?? {};
    const history = Array.isArray(body.messages) ? body.messages : [];

    if (!message) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: previousState }, { status: 400 });
    }

    // DEBUG: log pricing file visibility + sanity checks (server-side)
    // If this shows "file exists: false" OR sanity28 is undefined, Sunny cannot quote correctly.
    debugLoadSolarPricing();

    // Deterministic runtime FIRST (solar pricing + booking lives here)
    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, previousState);
    const { state } = runtimeResult;
    let reply = runtimeResult.reply;

    // If booked, attempt sheet + email sync
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
        console.error("Failed to sync booking or send booking emails:", error);
        state.bookingSynced = false;
        state.bookingEmailSent = false;
        state.needsHumanFollowup = true;
        state.outcome = "needs_human_followup";
        reply =
          "I confirmed your booking request, but I couldn't finish our confirmation steps. A human will finalize this right away.";
      }
    }

    // Do NOT fall back to OpenAI for solar pricing/booking flows.
    const isSolarFlow =
      state.serviceId === "solar_panel_cleaning" &&
      (state.intent === "pricing_quote" || state.intent === "booking_request");

    // Only fallback to OpenAI for general chat / non-solar service questions,
    // or when runtime explicitly can't proceed safely.
    const shouldFallback =
      !isSolarFlow &&
      (reply === SAFE_FAIL_MESSAGE ||
        state.needsHumanFollowup ||
        state.outcome === "general_lead" ||
        state.intent === "general");

    if (!shouldFallback) {
      return NextResponse.json({ reply, state });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state });
    }

    const normalizedHistory = history
      .filter(
        (entry): entry is Message =>
          !!entry &&
          (entry.role === "user" || entry.role === "assistant") &&
          typeof entry.content === "string"
      )
      .map((entry) => ({ role: entry.role, content: entry.content }));

    const last = normalizedHistory[normalizedHistory.length - 1];
    if (!last || last.role !== "user" || last.content !== message) {
      normalizedHistory.push({ role: "user", content: message });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...normalizedHistory],
    });

    const openAiReply = completion.choices[0]?.message?.content?.trim() || SAFE_FAIL_MESSAGE;

    return NextResponse.json({ reply: openAiReply, state });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
