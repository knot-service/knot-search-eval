import { createHmac, timingSafeEqual } from "node:crypto";
export function validPassword(
  input: unknown,
  expected: string | undefined,
): boolean {
  if (!expected || typeof input !== "string" || !input || input.length > 1024)
    return false;
  const a = Buffer.from(input),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function signSession(secret: string, now = Date.now()): string {
  const expires = String(now + 8 * 60 * 60 * 1000);
  return `${expires}.${createHmac("sha256", secret).update(expires).digest("hex")}`;
}
export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!token || !secret || secret.length < 32) return false;
  const [exp, sig, ...rest] = token.split(".");
  if (
    rest.length ||
    !/^\d+$/.test(exp) ||
    !sig ||
    !/^\d+$/.test(exp) ||
    Number(exp) <= now
  )
    return false;
  const actual = Buffer.from(sig, "hex"),
    expected = createHmac("sha256", secret).update(exp).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
