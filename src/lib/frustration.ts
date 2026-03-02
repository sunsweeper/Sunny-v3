export const HANDOFF_COOLDOWN_MS = 10 * 60 * 1000;

const PROFANITY_PATTERNS = [
  /\bf+u+c+k+\b/i,
  /\bsh+i+t+\b/i,
  /\bd+a+m+n+\b/i,
  /\bb+i+t+c+h+\b/i,
  /\basshole\b/i,
  /\bwtf\b/i,
];

const FRUSTRATION_PATTERNS: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /not what i asked/i, points: 2 },
  { pattern: /you('?re| are) not listening/i, points: 2 },
  { pattern: /this (isn'?t|is not) helping/i, points: 2 },
  { pattern: /\bwrong\b/i, points: 1 },
  { pattern: /\bstop\b/i, points: 1 },
  { pattern: /\b(forget it|never mind|nevermind)\b/i, points: 1 },
];

const HANDOFF_ACCEPTANCE_PATTERNS = [
  /\btalk to (a )?(human|person|representative|agent)\b/i,
  /\blive person\b/i,
  /\brepresentative\b/i,
  /\bagent\b/i,
  /\bcall me\b/i,
  /\byes\b/i,
  /\byep\b/i,
  /\byeah\b/i,
  /\bokay\b/i,
  /\bok\b/i,
  /\bsure\b/i,
];

export function frustrationDelta(userText: string): number {
  const text = userText.trim();
  if (!text) return 0;

  let delta = 0;

  if (PROFANITY_PATTERNS.some((pattern) => pattern.test(text))) {
    delta += 2;
  }

  for (const rule of FRUSTRATION_PATTERNS) {
    if (rule.pattern.test(text)) delta += rule.points;
  }

  if (isAllCaps(text)) delta += 1;

  if (isRepeatedShortNoOrWrong(text)) delta += 1;

  return delta;
}

export function shouldOfferHandoff(params: {
  frustrationScore: number;
  handoffActive: boolean;
  lastHandoffOfferedAt: number | null;
  now: number;
}): boolean {
  const { frustrationScore, handoffActive, lastHandoffOfferedAt, now } = params;

  if (handoffActive || frustrationScore < 3) return false;
  if (lastHandoffOfferedAt === null) return true;

  return now - lastHandoffOfferedAt >= HANDOFF_COOLDOWN_MS;
}

export function isHandoffAccepted(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;

  return HANDOFF_ACCEPTANCE_PATTERNS.some((pattern) => pattern.test(text));
}

function isAllCaps(text: string): boolean {
  const letters = text.match(/[a-zA-Z]/g);
  if (!letters || letters.length < 5) return false;

  const uppercaseCount = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return uppercaseCount / letters.length >= 0.8;
}

function isRepeatedShortNoOrWrong(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter(Boolean);

  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.every((token) => token === "no" || token === "wrong");
}
