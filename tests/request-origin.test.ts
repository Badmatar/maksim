import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { checkOrigin } from '@/lib/auth/request-origin';
const endpoint = 'https://app.example/api/auth/bot';
beforeEach(() => { vi.stubEnv('APP_URL', 'https://app.example'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', ''); vi.stubEnv('VERCEL_URL', ''); });
afterEach(() => vi.unstubAllEnvs());
function request(headers: Record<string, string> = {}, url = endpoint) { return new Request(url, { method: 'POST', headers }); }
it('accepts the browser origin of the application', () => { expect(checkOrigin(request({ origin: 'https://app.example', 'sec-fetch-site': 'same-origin' }))).toBe('https://app.example'); });
it('supports a served domain alias when APP_URL still contains an older deployment', () => {
  vi.stubEnv('APP_URL', 'https://old-deployment.vercel.app');
  expect(checkOrigin(request({ origin: 'https://app.example' }))).toBe('https://app.example');
});
it('supports an internal proxy URL only for an explicit server-provided Vercel host', () => {
  vi.stubEnv('APP_URL', 'https://old.example'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'app.example');
  expect(checkOrigin(request({ origin: 'https://app.example' }, 'http://localhost:3000/api/auth/bot'))).toBe('https://app.example');
});
it('rejects a foreign Origin even if other headers claim to be trusted', () => {
  expect(() => checkOrigin(request({ origin: 'https://evil.example', 'x-maksim-client-origin': 'https://app.example', referer: 'https://app.example/login' }))).toThrow('FORBIDDEN_ORIGIN');
});
it('handles an absent Origin using an exact-origin custom header', () => {
  expect(checkOrigin(request({ 'x-maksim-client-origin': 'https://app.example', 'sec-fetch-site': 'same-origin' }))).toBe('https://app.example');
});
it('rejects an absent Origin when the custom header points elsewhere', () => {
  expect(() => checkOrigin(request({ 'x-maksim-client-origin': 'https://evil.example' }))).toThrow();
});
it('handles an absent Origin using a same-origin Referer but rejects a foreign Referer', () => {
  expect(checkOrigin(request({ referer: 'https://app.example/login' }))).toBe('https://app.example');
  expect(() => checkOrigin(request({ referer: 'https://evil.example/login' }))).toThrow();
});
it('rejects cross-site and same-site cross-origin browser requests even with forged matching values', () => {
  for (const site of ['cross-site', 'same-site', 'none']) expect(() => checkOrigin(request({ origin: 'https://app.example', 'sec-fetch-site': site }))).toThrow();
});
it('does not trust caller-supplied forwarded host headers', () => {
  expect(() => checkOrigin(request({ origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }))).toThrow();
});
it('rejects opaque origins, credentials in origins and requests with no origin evidence', () => {
  for (const headers of <Record<string, string>[]>[{ origin: 'null' }, { origin: 'https://app.example@evil.example' }, {}, { origin: 'https://app.example/admin' }]) expect(() => checkOrigin(request(headers))).toThrow();
});
