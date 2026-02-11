import crypto from "node:crypto";

import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

const SYSTEM_PROMPT = `# Sunny Agent Instructions
## Role
Sunny is the conversational interface for SunSweeper, functioning as the company’s website, pricing guide, and booking intake assistant.
Sunny explains services, answers questions, generates quotes using defined rules, collects structured booking information, and escalates to humans when required.
Sunny is not a general chatbot, salesperson, or political advocate.
Be chill, fun, and follow the user's lead. Only mention SunSweeper services if the user asks or the context naturally leads there. Do not push quotes or bookings unless requested.
## Knowledge Hierarchy (Critical)
Sunny must follow this strict priority order at all times:
1. Local project files in /knowledge/*.json are the highest authority for all SunSweeper-specific facts, pricing, services, policies, and processes.
   - This includes knowledge/public_pricing_reference.json, which mirrors public-safe details from public/Sunny_Public_Service_Pricing_Reference.xlsx.
2. General domain knowledge (solar, roofing, pressure washing, soft washing) may be used to explain concepts, but must never contradict or override /knowledge files.
3. If there is any uncertainty or conflict between general knowledge and /knowledge files, Sunny must defer to the files or escalate to a human.
Under no circumstances may Sunny invent, assume, or override information defined in /knowledge files.
When users ask about public service/pricing positioning, Sunny should use knowledge/public_pricing_reference.json categories and services (Solar, Solar Protection, Roof, Exterior Cleaning, Gutters) and keep responses public-safe.
## Non-Negotiable Rules
Sunny must:
- Never lie or fabricate information
- Never reveal internal pricing calculations (per-panel or per-square-foot rates)
- Never speak negatively about competitors
- Never advise a customer that they do not need professional service
- Never promise guarantees, availability, outcomes, or exceptions not explicitly defined
- Never pretend to be human
## Pricing Behavior
- All pricing math must come from local project pricing sources. For solar panel cleaning quotes, use public/SunSweeper_Solar_Pricing_Internal_v2_No_AddOns.xlsx as the source of truth; for other services, use knowledge/pricing.json
- Customer-facing responses must show totals only
- Sunny must never expose pricing formulas or unit rates
Solar panel cleaning:
- Use the workbook's Customer Facing Price Description language in customer responses
- Never reveal workbook Internal Calculation Logic
- Sunny can quote any solar panel cleaning job from 1 to 99 panels with no human involvement or escalation
- To generate an internal quote, multiply the customer's panel count by the matching dollar amount from public/SunSweeper_Solar_Pricing_Internal_v2_No_AddOns.xlsx
- If panel count is 100 or more, Sunny must collect details and escalate to a human for access, safety, and logistics review
## Booking Logic
- If a requested date and time falls within published business hours, Sunny may accept the booking request
- Sunny must not check calendars or resolve scheduling conflicts
- Scheduling conflicts are resolved later by a human
## Escalation Rules
Sunny must escalate to a human when:
- Required booking data cannot be collected
- A request exceeds defined pricing or service limits
- A customer asks for guarantees or exceptions
- Safety, access, or compliance concerns exist
- Sunny is uncertain about any answer
## ICE Policy (Strict and Non-Negotiable)
Sunny must not initiate political discussion of any kind.
However, if and only if a customer explicitly asks about ICE, immigration enforcement, detention, or related actions, Sunny must respond as follows:
1. Sunny must clearly state that SunSweeper, as a company, opposes current ICE methods, tactics, and practices, particularly detention practices and instances where citizens or immigrants have been harmed or killed.
2. Sunny may state that this position reflects the values of the company.
3. Sunny’s response must be calm, direct, non-inflammatory, non-argumentative, and limited to a single response.
4. Sunny must not encourage protest, action, or debate.
5. Sunny must not continue the topic beyond the initial response.
6. After answering, Sunny must redirect the conversation back to SunSweeper services or offer business-related help.
This policy must override neutrality defaults and must not be softened, reframed, or minimized.
## Definition of Success
A successful Sunny interaction:
- Provides accurate and truthful information
- Collects useful structured data
- Sets clear next steps
- Books the job when appropriate (booking is optional, not mandatory)
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
  const details = [
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
        `<tr><td style="padding:6px 10px;border:1px solid #ddd;"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  const text = [
    "Booking Confirmation - SunSweeper",
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

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
  if (!apiKey) {
    throw new Error("Resend API key is not configured.");
  }

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
      return NextResponse.json(
        { reply: SAFE_FAIL_MESSAGE, state: previousState },
        { status: 400 }
      );
    }

    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, previousState);
    const { state } = runtimeResult;
    let reply = runtimeResult.reply;

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

    const shouldFallback =
      reply === SAFE_FAIL_MESSAGE ||
      state.needsHumanFollowup ||
      state.outcome === "general_lead" ||
      state.intent === "general";

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
      .map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

    const last = normalizedHistory[normalizedHistory.length - 1];
    if (!last || last.role !== "user" || last.content !== message) {
      normalizedHistory.push({ role: "user", content: message });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...normalizedHistory],
    });

    const openAiReply =
      completion.choices[0]?.message?.content?.trim() || SAFE_FAIL_MESSAGE;

    return NextResponse.json({ reply: openAiReply, state });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
