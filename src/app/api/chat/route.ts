import crypto from "crypto";
import fs from "fs";
import path from "path";

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
      body: JSON.stri
