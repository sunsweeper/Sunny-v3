const NAME_TOKEN_REGEX = /^[A-Za-z]{2,20}$/;

const EXPLICIT_NAME_PATTERNS = [
  /\bmy\s+name\s+is\s+([A-Za-z]{2,20})(?:\b|\s|$)/i,
  /\bi\s*(?:'|’)?m\s+([A-Za-z]{2,20})(?:\b|\s|$)/i,
  /\bi\s+am\s+([A-Za-z]{2,20})(?:\b|\s|$)/i,
  /\bthis\s+is\s+([A-Za-z]{2,20})(?:\b|\s|$)/i,
];

export const extractFirstName = (text: string): string | null => {
  for (const pattern of EXPLICIT_NAME_PATTERNS) {
    const match = pattern.exec(text);
    const token = match?.[1] ?? "";
    if (!NAME_TOKEN_REGEX.test(token)) continue;

    const normalized = token.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return null;
};
