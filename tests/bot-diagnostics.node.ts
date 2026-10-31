import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseBot, type ReadOnlyBotApi } from '../lib/bot-diagnostics';
const config = { webhookUrl: 'https://example.vercel.app/api/telegram/webhook', secret: 'local-test-only' };
const api: ReadOnlyBotApi = {
  getMe: async () => ({ username: 'example_bot' }),
  getWebhookInfo: async () => ({ url: config.webhookUrl, pending_update_count: 0 }),
};
function fetcher(overrides: Record<string, unknown> = {}, status = 200): typeof fetch {
  return (async (input, init) => {
    assert.equal(init?.redirect, 'manual');
    const url = String(input);
    assert.ok(url.startsWith('https://example.vercel.app/'));
    if (url.endsWith('/api/health')) return Response.json({ status: 'ok' });
    assert.equal(new Headers(init?.headers).get('x-telegram-bot-api-secret-token'), config.secret);
    return Response.json({ configured: { BOT_TOKEN: true, WEBHOOK_SECRET: true, CRON_SECRET: true, DATABASE_URL: true }, botUsername: 'example_bot', scheduler: { status: 'ok', completedAt: new Date().toISOString() }, jobs: [], ...overrides }, { status });
  }) as typeof fetch;
}
test('healthy read-only diagnostics use only health, runtime info and Telegram reads', async () => {
  const report = await diagnoseBot(config, api, fetcher());
  assert.equal(report.ok, true); assert.deepEqual(report.issues, []); assert.deepEqual(report.warnings, []);
  assert.ok(!JSON.stringify(report).includes(config.secret));
});
test('detects BOT_TOKEN missing in Vercel even when GitHub token works', async () => {
  const report = await diagnoseBot(config, api, fetcher({ configured: { BOT_TOKEN: false, WEBHOOK_SECRET: true, CRON_SECRET: true, DATABASE_URL: true } }));
  assert.equal(report.ok, false); assert.ok(report.issues.some(x => x.includes('BOT_TOKEN is missing in Vercel')));
});
test('detects mismatched webhook secret', async () => {
  const report = await diagnoseBot(config, api, fetcher({}, 401));
  assert.equal(report.ok, false); assert.ok(report.issues.some(x => x.includes('WEBHOOK_SECRET differs')));
});
test('detects a webhook pointing at an older deployment', async () => {
  const report = await diagnoseBot(config, { ...api, getWebhookInfo: async () => ({ url: 'https://old.example/api/telegram/webhook', pending_update_count: 3 }) }, fetcher());
  assert.equal(report.webhookMatchesApp, false); assert.equal(report.pendingTelegramUpdates, 3); assert.equal(report.ok, false);
});
test('identifies a missing scheduler and old failed jobs without exposing payloads', async () => {
  const report = await diagnoseBot(config, api, fetcher({ scheduler: {}, jobs: [{ kind: 'telegram_update', status: 'failed', _count: 1 }], failureTypes: { BOT_TOKEN_missing_in_Vercel: 1 } }));
  assert.equal(report.warnings.length, 2); assert.equal(report.ok, true);
});
test('detects a token for a different bot', async () => {
  const report = await diagnoseBot(config, api, fetcher({ botUsername: 'different_bot' }));
  assert.equal(report.ok, false); assert.ok(report.issues.some(x => x.includes('different bot')));
});
