import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ cookie: '', create: vi.fn(), consume: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock('@/lib/db', () => ({ db: {}, DomainError: class extends Error {} }));
vi.mock('@/lib/auth/bot-login', () => ({
  BOT_LOGIN_COOKIE: 'maksim_bot_login', BOT_LOGIN_COOKIE_PATH: '/api/auth/bot',
  createBotLogin: state.create, consumeBotLogin: state.consume,
  BotLoginLimitError: class extends Error {}, BotLoginConfigError: class extends Error {},
}));
import { POST, GET } from '@/app/api/auth/bot/route';
import { decodeSession } from '@/lib/auth';
beforeEach(() => {
  vi.clearAllMocks(); state.cookie = 'browser-binding';
  vi.stubEnv('APP_URL', 'https://example.vercel.app'); vi.stubEnv('AUTH_SECRET', 'local-route-session-key-more-than-32-characters');
  state.create.mockResolvedValue({ cookie: 'private-binding-never-in-json', botUrl: 'https://t.me/testbot?start=login_example', expiresAt: Date.now() + 300000 });
  state.consume.mockResolvedValue({ status: 'pending' });
});
afterEach(() => vi.unstubAllEnvs());
it('rejects cross-origin creation before allocating a challenge', async () => {
  const response = await POST(new Request('https://example.vercel.app/api/auth/bot', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  expect(response.status).toBe(403); expect(state.create).not.toHaveBeenCalled();
});
it('sets a private browser cookie but only exposes the bot deep link to JavaScript', async () => {
  const response = await POST(new Request('https://example.vercel.app/api/auth/bot', { method: 'POST', headers: { origin: 'https://example.vercel.app' } }));
  expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).not.toContain('private-binding');
  expect(state.create).toHaveBeenCalledWith('browser-binding', 'https://example.vercel.app');
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=strict'); expect(cookie).toContain('Path=/api/auth/bot');
});
it('does not create a session before Telegram approval, even with forged query parameters', async () => {
  const response = await GET(new Request('https://example.vercel.app/api/auth/bot?telegramId=12345&role=OWNER'));
  expect(await response.json()).toEqual({ status: 'pending' }); expect(response.headers.get('set-cookie')).toBe(null);
  expect(state.consume).toHaveBeenCalledWith('browser-binding');
});
it('sets the existing signed session only after approved consumption and clears the pending cookie', async () => {
  state.consume.mockResolvedValue({ status: 'approved', principal: { telegramId: '12345', role: 'OWNER', exp: Date.now() + 10000 } });
  const response = await GET(new Request('https://example.vercel.app/api/auth/bot'));
  const cookies = response.headers.getSetCookie();
  const session = cookies.find(x => x.startsWith('maksim_session='))!.split(';')[0].slice('maksim_session='.length);
  expect(decodeSession(session)?.telegramId).toBe('12345');
  expect(cookies.some(x => x.startsWith('maksim_bot_login=') && x.includes('Max-Age=0'))).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects cross-site polling and reports expired challenges', async () => {
  expect((await GET(new Request('https://example.vercel.app/api/auth/bot', { headers: { 'sec-fetch-site': 'cross-site' } }))).status).toBe(403);
  expect(state.consume).not.toHaveBeenCalled(); state.consume.mockResolvedValue({ status: 'expired' });
  expect((await GET(new Request('https://example.vercel.app/api/auth/bot'))).status).toBe(410);
});

it('creates a challenge for the actual served origin when APP_URL is stale', async () => {
  vi.stubEnv('APP_URL', 'https://old.example');
  const response = await POST(new Request('https://example.vercel.app/api/auth/bot', { method: 'POST', headers: { origin: 'https://example.vercel.app', 'sec-fetch-site': 'same-origin' } }));
  expect(response.status).toBe(200); expect(state.create).toHaveBeenCalledWith('browser-binding', 'https://example.vercel.app');
});
it('accepts an Origin-stripped request only with verified same-origin evidence', async () => {
  const response = await POST(new Request('https://example.vercel.app/api/auth/bot', { method: 'POST', headers: { 'x-maksim-client-origin': 'https://example.vercel.app', 'sec-fetch-site': 'same-origin' } }));
  expect(response.status).toBe(200); expect(state.create).toHaveBeenCalledWith('browser-binding', 'https://example.vercel.app');
});
