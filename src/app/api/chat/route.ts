import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

export const runtime = "nodejs";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  console.log('[SUNNY-API-MARKER] /api/chat POST hit at', timestamp);

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

    const runtimeInstance = createSunnyRuntime({
      knowledgeDir: `${process.cwd()}/knowledge`,
    });

    const runtimeResult = runtimeInstance.handleMessage(message, previousState);
    const { state } = runtimeResult;
    let reply = runtimeResult.reply;

    console.log('RUNTIME STATE:', {
      intent: state.intent,
      serviceId: state.serviceId,
      outcome: state.outcome,
      needsHumanFollowup: state.needsHumanFollowup,
      replyPreview: reply.substring(0, 140)
    });

    // Force deterministic reply for pricing and booking
    if (state.intent === 'pricing_quote' || (reply.toLowerCase().includes('panels') && reply.includes('$'))) {
      console.log('FORCING DETERMINISTIC REPLY — pricing flow');
      return NextResponse.json({ reply, state });
    }

    if (state.intent === 'booking_request') {
      console.log('FORCING DETERMINISTIC REPLY — booking flow');
      return NextResponse.json({ reply, state });
    }

    // Fallback to OpenAI
    console.log('FALLING BACK TO OPENAI');

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: previousState });
    }

    const normalizedHistory = history
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

    console.log('Returned OpenAI reply');
    return NextResponse.json({ reply: openAiReply, state: previousState });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
