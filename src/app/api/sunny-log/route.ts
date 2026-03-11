import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SunnyInboundLog = {
  timestamp?: string;
  session_id?: string;
  known_name?: string | null;
  role?: "user" | "assistant";
  type?: "message" | "ucs";
  service_key?: string;
  text?: string;
  url?: string;
  user_agent?: string;
  lead_detected?: boolean;
  lead_reason?: string;
  phone?: string;
  email?: string;
  handoff_requested?: boolean;
};

const SHEET_LOG_WEBHOOK_URL = process.env.SUNNY_LOG_GOOGLE_SCRIPT_URL;

async function sendToGoogleSheet(log: Required<SunnyInboundLog>) {
  if (!SHEET_LOG_WEBHOOK_URL) {
    console.warn("[SUNNY-SHEET-LOG] SUNNY_LOG_GOOGLE_SCRIPT_URL not set. Skipping Google Sheet append.");
    return;
  }

  const row = {
    ts: log.timestamp,
    session_id: log.session_id,
    known_name: log.known_name,
    role: log.role,
    type: log.type,
    service_key: log.service_key,
    text: log.text,
    url: log.url,
    user_agent: log.user_agent,
    lead_detected: log.lead_detected,
    lead_reason: log.lead_reason,
    phone: log.phone,
    email: log.email,
    handoff_requested: log.handoff_requested,
  };

  const response = await fetch(SHEET_LOG_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheet webhook failed (${response.status}): ${body.slice(0, 500)}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SunnyInboundLog;

    const normalized: Required<SunnyInboundLog> = {
      timestamp: body.timestamp || new Date().toISOString(),
      session_id: (body.session_id || "anonymous").trim() || "anonymous",
      known_name: body.known_name ?? "",
      role: body.role || "user",
      type: body.type || "message",
      service_key: body.service_key || "",
      text: body.text || "",
      url: body.url || "",
      user_agent: body.user_agent || "",
      lead_detected: Boolean(body.lead_detected),
      lead_reason: body.lead_reason || "",
      phone: body.phone || "",
      email: body.email || "",
      handoff_requested: Boolean(body.handoff_requested),
    };

    console.log("[SUNNY-LOG-PIPELINE] inbound", JSON.stringify(normalized));

    try {
      await sendToGoogleSheet(normalized);
      console.log("[SUNNY-LOG-PIPELINE] google sheet append succeeded", {
        sessionId: normalized.session_id,
        role: normalized.role,
      });
    } catch (sheetError) {
      console.error("[SUNNY-LOG-PIPELINE] google sheet append failed", sheetError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SUNNY-LOG-PIPELINE] fatal error", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
