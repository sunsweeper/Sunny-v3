// src/app/api/send-email/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BookingState = {
  panelCount?: number;
  price?: number;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  dateTime?: string;
  confirmed?: boolean;
  [key: string]: unknown;
};

type SendEmailBody = {
  to?: string[] | string;
  subject?: string;
  html?: string;
  text?: string;
  state?: BookingState;
  from?: string;
};

type ResendErrorResponse = {
  message?: string;
  name?: string;
  statusCode?: number;
};

function normalizeTo(to: SendEmailBody["to"]): string[] {
  if (!to) return [];
  return Array.isArray(to) ? to : [to];
}

function buildHtmlFromState(state: BookingState) {
  const panelCount = typeof state.panelCount === "number" ? state.panelCount : undefined;
  const price = typeof state.price === "number" ? state.price : undefined;
  const priceStr = typeof price === "number" ? price.toFixed(2) : "TBD";

  const fullName = typeof state.fullName === "string" ? state.fullName : "there";
  const email = typeof state.email === "string" ? state.email : "N/A";
  const phone = typeof state.phone === "string" ? state.phone : "N/A";
  const address = typeof state.address === "string" ? state.address : "N/A";
  const dateTime = typeof state.dateTime === "string" ? state.dateTime : "N/A";

  const safePanelText = typeof panelCount === "number" ? `${panelCount}` : "N/A";

  const html = `
    <h2>Booking Confirmed!</h2>
    <p>Hi ${fullName},</p>
    <p>Your solar panel cleaning for ${safePanelText} panels at ${address} is scheduled for ${dateTime}.</p>
    <p>Total: $${priceStr}</p>
    <p>Phone: ${phone}</p>
    <p>We'll see you then! Questions? Reply or call.</p>
    <hr>
    <p><small>Copy for Aaron - new booking logged.</small></p>
  `.trim();

  const text = `Booking Confirmed: ${fullName}, ${safePanelText} panels, $${priceStr}, ${dateTime} at ${address}. Email: ${email}. Phone: ${phone}`;

  return { html, text };
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SendEmailBody;

    const to = normalizeTo(body.to);
    if (to.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing 'to' (recipient list)" }, { status: 400 });
    }

    const subject =
      typeof body.subject === "string" && body.subject.trim()
        ? body.subject.trim()
        : "SunSweeper Confirmation";

    let html = typeof body.html === "string" && body.html.trim() ? body.html : "";
    let text = typeof body.text === "string" && body.text.trim() ? body.text : "";

    if (!html && body.state) {
      const built = buildHtmlFromState(body.state);
      html = built.html;
      text = built.text;
    }

    if (!html) {
      return NextResponse.json(
        { ok: false, error: "Missing 'html' (or provide 'state' to auto-build)" },
        { status: 400 }
      );
    }

    const from =
      (typeof body.from === "string" && body.from.trim()) ||
      process.env.EMAIL_FROM ||
      "SunSweeper <no-reply@sunsweeper.com>";

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing RESEND_API_KEY env var on Vercel. Add it, or swap this route to your provider.",
        },
        { status: 500 }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text: text || undefined,
      }),
    });

    const raw = await resendRes.text();
    const data = safeJsonParse<unknown>(raw);

    if (!resendRes.ok) {
      const errObj = (data && typeof data === "object" ? (data as ResendErrorResponse) : null);
      return NextResponse.json(
        { ok: false, error: errObj?.message || raw || "Email send failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-email route error:", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
