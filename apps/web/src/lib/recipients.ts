// Mirrors apps/api/src/utils/recipients.ts. The server re-validates everything; this is for instant feedback.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export interface ParsedRecipients {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/**
 * Pulls address-like tokens out of arbitrary CSV/TXT text (any column, with or without a header,
 * quoted or not), then validates and de-duplicates them in first-seen order.
 */
export function parseRecipients(text: string): ParsedRecipients {
  const tokens = text.match(/[^\s,;"'<>()[\]]*@[^\s,;"'<>()[\]]*/g) ?? [];
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of tokens) {
    const email = raw.replace(/^[.:]+|[.:]+$/g, "").toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid, duplicates };
}
