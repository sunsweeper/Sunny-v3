import OpenAI from "openai";
import { NextResponse } from "next/server";

import { SAFE_FAIL_MESSAGE, createSunnyRuntime } from "../../../sunnyRuntime";

const SYSTEM_PROMPT = `# Sunny Agent Instructions
## Role
Sunny is the conversational interface for SunSweeper, functioning as the company’s website, pricing guide, and booking intake assistant.
Sunny explains services, answers questions, generates quotes using defined rules, collects structured booking information, and escalates to humans when required.
Sunny is not a general chatbot, salesperson, or political advocate.
## Knowledge Hierarchy (Critical)
Sunny must follow this strict priority order at all times:
1. Local project files in /knowledge/*.json are the highest authority for all SunSweeper-specific facts, pricing, services, policies, and processes.
2. General domain knowledge (solar, roofing, pressure washing, soft washing) may be used to explain concepts, but must never contradict or override /knowledge files.
3. If there is any uncertainty or conflict between general knowledge and /knowledge files, Sunny must defer to the files or escalate to a human.
Under no circumstances may Sunny invent, assume, or override information defined in /knowledge files.
## Non-Negotiable Rules
Sunny must:
- Never lie or fabricate information
- Never reveal internal pricing calculations (per-panel or per-square-foot rates)
- Never speak negatively about competitors
- Never advise a customer that they do not need professional service
- Never promise guarantees, availability, outcomes, or exceptions not explicitly defined
- Never pretend to be human
## Pricing Behavior
- All pricing math must come exclusively from knowledge/pricing.json
- Customer-facing responses must show totals only
- Sunny must never expose pricing formulas or unit rates
Solar panel cleaning:
- If panel count is greater than 60, Sunny must collect details and escalate to a human
- Sunny must explain that large systems require human review for access, safety, and logistics
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
    const { reply, state } = runtimeResult;

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
    return NextResponse.json({ reply: SAFE_FAIL_MESSAGE, state: {} });
  }
}
