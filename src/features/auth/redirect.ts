/**
 * Accepts only same-origin absolute paths for post-login redirects, rejecting protocol-relative URLs
 * ("//evil.com"), backslash tricks and anything with a scheme. Prevents open-redirect abuse of ?callbackUrl=.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001F]/.test(value)) return null;
  if (value === "/login" || value === "/register") return null;
  return value;
}

/**
 * Auth.js sends `callbackUrl` as an absolute URL. Accept it only when its origin is one of the app's own
 * origins, and reduce it to a safe path; anything else (other hosts, other schemes) is dropped.
 */
export function callbackToPath(value: unknown, ownOrigins: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("/")) return safeRedirectPath(value);
  try {
    const url = new URL(value);
    if (!ownOrigins.includes(url.origin)) return null;
    return safeRedirectPath(`${url.pathname}${url.search}`);
  } catch {
    return null;
  }
}
