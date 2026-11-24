import { describe, expect, it } from "vitest";
import { normalizeRecipients, isValidEmail } from "../src/utils/recipients";
import { planSchedule } from "../src/utils/schedule";
import { canTransition, assertTransition } from "../src/utils/emailState";
import { createEmailIdempotencyKey } from "../src/utils/idempotency";
import { encrypt, decrypt } from "../src/utils/crypto";

describe("recipients", () => {
  it("validates addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("john.doe+tag@sub.example.com")).toBe(true);
    for (const bad of ["plain", "a@b", "a b@c.com", "@x.com", "a@.com", "a@@b.com"]) expect(isValidEmail(bad)).toBe(false);
  });
  it("de-duplicates case-insensitively and separates invalid rows", () => {
    const r = normalizeRecipients([" A@x.com", "a@X.com", "bad", "b@x.com", ""]);
    expect(r.valid).toEqual(["a@x.com", "b@x.com"]);
    expect(r.invalid).toEqual(["bad"]);
    expect(r.duplicates).toBe(1);
  });
});

describe("planSchedule", () => {
  const startAt = new Date("2030-01-01T10:00:00Z");
  it("spaces emails by the delay per sender and round-robins senders", () => {
    const p = planSchedule({ count: 4, senderCount: 2, startAt, delayMs: 2000, hourlyLimit: 100 });
    expect(p.map((s) => s.senderIndex)).toEqual([0, 1, 0, 1]);
    expect(p.map((s) => s.scheduledAt.getTime() - startAt.getTime())).toEqual([0, 0, 2000, 2000]);
  });
  it("pushes emails beyond the hourly limit into the next hour, preserving order", () => {
    const p = planSchedule({ count: 25, senderCount: 1, startAt, delayMs: 1000, hourlyLimit: 10 });
    const t = p.map((s) => s.scheduledAt.getTime());
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    for (let i = 10; i < t.length; i++) expect(t[i] - t[i - 10]).toBeGreaterThanOrEqual(3_600_000);
  });
});

describe("email state machine", () => {
  it("allows the happy path and retries", () => {
    expect(canTransition("SCHEDULED", "QUEUED")).toBe(true);
    expect(canTransition("QUEUED", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "SENT")).toBe(true);
    expect(canTransition("PROCESSING", "RETRYING")).toBe(true);
    expect(canTransition("RETRYING", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "RATE_LIMITED")).toBe(true);
  });
  it("never leaves terminal states", () => {
    for (const s of ["SENT", "FAILED", "CANCELLED"] as const) {
      expect(canTransition(s, "PROCESSING")).toBe(false);
      expect(() => assertTransition(s, "QUEUED")).toThrow();
    }
  });
});

describe("idempotency and crypto", () => {
  it("derives the same key for the same campaign and recipient regardless of case", () => {
    expect(createEmailIdempotencyKey("c1", "A@x.com")).toBe(createEmailIdempotencyKey("c1", " a@X.com"));
    expect(createEmailIdempotencyKey("c1", "a@x.com")).not.toBe(createEmailIdempotencyKey("c2", "a@x.com"));
  });
  it("round-trips encrypted secrets and rejects tampering", () => {
    const enc = encrypt("hunter2");
    expect(enc).not.toContain("hunter2");
    expect(decrypt(enc)).toBe("hunter2");
    expect(() => decrypt(enc.slice(0, -2) + "xx")).toThrow();
  });
});
