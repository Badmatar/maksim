import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn(), group: vi.fn(), setting: vi.fn(), failures: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { $queryRaw: state.query, job: { groupBy: state.group, findMany: state.failures }, setting: { findUnique: state.setting } } }));
import { GET } from '@/app/api/telegram/diagnostics/route';
const request = (secret = 'local-runtime-diagnostic') => new Request('https://example.vercel.app/api/telegram/diagnostics', { headers: { 'x-telegram-bot-api-secret-token': secret } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('WEBHOOK_SECRET', 'local-runtime-diagnostic');
  vi.stubEnv('BOT_TOKEN', 'test-credential-must-not-appear');
  vi.stubEnv('NEXT_PUBLIC_BOT_USERNAME', 'example_bot');
  state.query.mockResolvedValue([{ value: 1 }]); state.group.mockResolvedValue([]); state.setting.mockResolvedValue(null); state.failures.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it('blocks unauthenticated diagnostics without accessing the database', async () => {
  expect((await GET(request('wrong'))).status).toBe(401); expect(state.query).not.toHaveBeenCalled();
});
it('reports presence instead of credential values and identifies a missing Vercel token', async () => {
  vi.stubEnv('BOT_TOKEN', '');
  const response = await GET(request()); const body = await response.json();
  expect(response.status).toBe(200); expect(body.configured.BOT_TOKEN).toBe(false); expect(body.botUsername).toBe('example_bot');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(body)).not.toContain('local-runtime-diagnostic');
});
it('classifies queue failures without exposing raw errors, messages or stored settings', async () => {
  state.failures.mockResolvedValue([{ lastError: 'BOT_TOKEN is not configured' }, { lastError: 'private request data should never appear in report' }]);
  state.setting.mockResolvedValue({ value: { status: 'ok', done: 0, failed: 1, secret: 'private-stored-setting' } });
  vi.stubEnv('NEXT_PUBLIC_BOT_USERNAME', '123456:invalid-sensitive-value');
  const body = await (await GET(request())).json();
  expect(body.failureTypes).toEqual({ BOT_TOKEN_missing_in_Vercel: 1, other_check_admin_queue: 1 });
  expect(body.scheduler).toEqual({ status: 'ok', done: 0, failed: 1 }); expect(body.botUsername).toBe(null);
  const text = JSON.stringify(body);
  for (const hidden of ['test-credential-must-not-appear', 'private request data', 'private-stored-setting', 'invalid-sensitive-value']) expect(text).not.toContain(hidden);
});
it('reports a database failure without leaking its exception', async () => {
  state.query.mockRejectedValue(new Error('postgresql://private-user:private-password@private-host/db'));
  const response = await GET(request());
  expect(response.status).toBe(503); const body = await response.json(); expect(body.database).toBe('unavailable');
  expect(JSON.stringify(body)).not.toContain('private-password');
});
