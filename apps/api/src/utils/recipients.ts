// Pragmatic address check (RFC 5322 in full is not worth it): local@domain.tld, no spaces, sane length.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

export interface RecipientReport {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/** Normalises, validates and de-duplicates (case-insensitive) while preserving first-seen order. */
export function normalizeRecipients(raw: string[]): RecipientReport {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (!isValidEmail(email)) {
      invalid.push(item.trim());
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
