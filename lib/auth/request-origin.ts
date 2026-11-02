// CSRF validation for browser mutations. Never derive trusted hosts from a
// caller-supplied Origin, Referer, or X-Forwarded-Host header.
function parsedOrigin(value: string | null | undefined, originOnly = false) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (originOnly && (url.pathname !== '/' || url.search || url.hash)) return null;
    return url.origin;
  } catch { return null; }
}
export function checkOrigin(req: Request): string {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new Error('FORBIDDEN_ORIGIN');

  const allowed = new Set<string>();
  for (const value of [req.url, process.env.APP_URL]) {
    const origin = parsedOrigin(value);
    if (origin) allowed.add(origin);
  }
  // Vercel supplies these on the server; they are not request headers. This also
  // covers reverse proxies whose internal Request.url uses a different hostname.
  for (const host of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (host && /^[A-Za-z0-9.-]+$/.test(host)) allowed.add(`https://${host.toLowerCase()}`);
  }

  const header = req.headers.get('origin');
  if (header !== null) {
    const origin = parsedOrigin(header, true);
    if (origin && allowed.has(origin)) return origin;
    // Never fall back to another header when Origin explicitly disagrees.
    throw new Error('FORBIDDEN_ORIGIN');
  }

  // Some privacy tools strip Origin. A custom header requires a CORS preflight
  // for cross-origin JavaScript, which this app does not permit. Still compare
  // its value against an exact trusted origin; never accept arbitrary values.
  const custom = parsedOrigin(req.headers.get('x-maksim-client-origin'), true);
  if (custom && allowed.has(custom)) return custom;
  const referer = parsedOrigin(req.headers.get('referer'));
  if (referer && allowed.has(referer)) return referer;
  throw new Error('FORBIDDEN_ORIGIN');
}
