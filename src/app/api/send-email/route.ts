import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      to?: string | string[];
      subject?: string;
      html?: string;
      text?: string;
    };

    const to = body.to;
    const subject = body.subject;
    const html = body.html;
    const text = body.text;
    const from = process.env.RESEND_FROM;
    const apiKey = process.env.RESEND_API_KEY;

    if (!from) {
      return NextResponse.json({ ok: false, error: "Missing RESEND_FROM" }, { status: 500 });
    }

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY" }, { status: 500 });
    }

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: to, subject, and html or text" },
        { status: 400 },
      );
    }

    console.log("[resend] attempt", { to, subject });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      }),
    });

    const result = (await response.json()) as { id?: string; name?: string; message?: string };
    const data = response.ok ? result : null;
    const error = response.ok ? null : result;

    console.log("[resend] result", { data, error });

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
