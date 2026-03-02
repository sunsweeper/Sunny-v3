export function extractEmail(text: string): string {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

export function extractPhone(text: string): string {
  const match = text.match(/(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}/);
  if (!match) return "";

  const digits = match[0].replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }

  return "";
}

export function detectLeadReason(text: string): { lead_detected: boolean; lead_reason: string } {
  const normalized = text.toLowerCase();

  const patterns: Array<{ reason: string; pattern: RegExp }> = [
    { reason: "pricing", pattern: /\b(price|pricing|cost|how much|quote|rate|rates)\b/i },
    { reason: "scheduling", pattern: /\b(schedule|scheduling|book|booking|appointment|available|availability|time slot)\b/i },
    { reason: "estimate", pattern: /\b(estimate|bid|proposal|assessment)\b/i },
    { reason: "callback", pattern: /\b(call me|callback|call back|reach me|contact me|text me)\b/i },
  ];

  for (const { reason, pattern } of patterns) {
    if (pattern.test(normalized)) {
      return { lead_detected: true, lead_reason: reason };
    }
  }

  return { lead_detected: false, lead_reason: "general" };
}

export function detectHumanRequest(text: string): boolean {
  return /\b(human|live person|real person|representative|agent|call me|talk to someone|speak to someone)\b/i.test(
    text
  );
}
