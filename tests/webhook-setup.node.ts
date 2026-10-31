import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrammyError } from 'grammy';
import { readWebhookConfig, webhookErrorMessage } from '../lib/webhook-setup';

const env = { BOT_TOKEN: '123456:' + 'example_token_for_tests', WEBHOOK_SECRET: 'test-secret-only', APP_URL: 'https://example.vercel.app' };

test('reports all missing secrets by name without revealing present values', () => {
  assert.throws(() => readWebhookConfig({ WEBHOOK_SECRET: env.WEBHOOK_SECRET }), error => {
    const message = webhookErrorMessage(error, env);
    return message.includes('BOT_TOKEN, APP_URL') && !message.includes(env.WEBHOOK_SECRET);
  });
});
test('rejects whitespace and malformed secret values before any API request', () => {
  for (const invalid of [{ BOT_TOKEN: 'wrong' }, { WEBHOOK_SECRET: 'bad secret' }, { APP_URL: ' ' + env.APP_URL }]) {
    assert.throws(() => readWebhookConfig({ ...env, ...invalid }));
  }
});
test('rejects a dashboard, HTTP, credentials, query and application path', () => {
  for (const APP_URL of ['https://vercel.com/team/project', 'https://vercel.com', 'http://example.com', 'https://user:password@example.com', 'https://example.com?token=hidden', 'https://example.com/admin']) {
    assert.throws(() => readWebhookConfig({ ...env, APP_URL }));
  }
});
test('normalizes the origin, including an optional trailing slash', () => {
  assert.equal(readWebhookConfig({ ...env, APP_URL: env.APP_URL + '/' }).webhookUrl, env.APP_URL + '/api/telegram/webhook');
});
test('shows Telegram response without exposing token or webhook secret', () => {
  const error = new GrammyError('failure', { ok: false, error_code: 400, description: `Bad Request: ${env.BOT_TOKEN} ${env.WEBHOOK_SECRET}` }, 'setWebhook', {});
  const message = webhookErrorMessage(error, env);
  assert.match(message, /400/);
  assert.ok(!message.includes(env.BOT_TOKEN));
  assert.ok(!message.includes(env.WEBHOOK_SECRET));
});
test('identifies invalid Telegram authentication without dumping the request', () => {
  const error = new GrammyError('failure', { ok: false, error_code: 401, description: 'Unauthorized' }, 'setWebhook', {});
  assert.match(webhookErrorMessage(error, env), /BOT_TOKEN/);
});
test('does not expose secrets embedded in network exceptions', () => {
  const error = new Error(`Failed https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?secret=${env.WEBHOOK_SECRET}`);
  const message = webhookErrorMessage(error, env);
  assert.ok(!message.includes(env.BOT_TOKEN));
  assert.ok(!message.includes(env.WEBHOOK_SECRET));
});
