import { beforeEach, afterAll, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { listResource } from '@/lib/admin';
import { createBotLogin, inspectBotLogin, approveBotLogin, consumeBotLogin, BotLoginLimitError, BOT_LOGIN_TTL } from '@/lib/auth/bot-login';
const key = 'local-auth-key-for-bot-login-tests-123456789';
function id(cookie: string) { return cookie.split('.')[0]; }
beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', key); vi.stubEnv('APP_URL', 'https://example.vercel.app');
  vi.stubEnv('BOT_TOKEN', '123456:test-only'); vi.stubEnv('NEXT_PUBLIC_BOT_USERNAME', 'testbot'); vi.stubEnv('OWNER_TELEGRAM_IDS', '12345');
  await db.setting.deleteMany(); await db.admin.deleteMany(); await db.auditLog.deleteMany();
});
afterAll(async () => { await db.$disconnect(); vi.unstubAllEnvs(); });
it('creates a short Telegram deep link and stores only the browser secret hash', async () => {
  const pending = await createBotLogin();
  expect(new URL(pending.botUrl).searchParams.get('start')!.length).toBeLessThanOrEqual(64);
  expect(pending.expiresAt - Date.now()).toBeGreaterThan(BOT_LOGIN_TTL - 5000);
  const record = await db.setting.findUniqueOrThrow({ where: { key: `botLogin:${id(pending.cookie)}` } });
  expect(JSON.stringify(record.value)).not.toContain(pending.cookie.split('.')[1]);
  expect(await consumeBotLogin(pending.cookie)).toEqual({ status: 'pending' });
});
it('requires explicit confirmation by an allowed Telegram account', async () => {
  const pending = await createBotLogin();
  await expect(inspectBotLogin(id(pending.cookie), '999')).rejects.toThrow('только владельцу');
  await expect(approveBotLogin(id(pending.cookie), '999')).rejects.toThrow();
  expect(await consumeBotLogin(pending.cookie)).toEqual({ status: 'pending' });
  expect(await inspectBotLogin(id(pending.cookie), '12345')).toEqual({ domain: 'example.vercel.app' });
  await approveBotLogin(id(pending.cookie), '12345');
  expect(await consumeBotLogin(pending.cookie)).toMatchObject({ status: 'approved', principal: { telegramId: '12345', role: 'OWNER' } });
});
it('binds approval to the initiating browser and rejects forged cookies', async () => {
  const first = await createBotLogin(), second = await createBotLogin();
  await approveBotLogin(id(first.cookie), '12345');
  expect(await consumeBotLogin(second.cookie)).toEqual({ status: 'pending' });
  expect(await consumeBotLogin(first.cookie + 'x')).toEqual({ status: 'expired' });
  const unsigned = `${id(first.cookie)}.${second.cookie.split('.')[1]}`;
  const signature = createHmac('sha256', key).update(`bot-login.${unsigned}`).digest('base64url');
  expect(await consumeBotLogin(`${unsigned}.${signature}`)).toEqual({ status: 'expired' });
  expect(await consumeBotLogin(first.cookie)).toMatchObject({ status: 'approved' });
});
it('consumes an approved challenge exactly once under concurrent requests', async () => {
  const pending = await createBotLogin(); await approveBotLogin(id(pending.cookie), '12345');
  const result = await Promise.all([consumeBotLogin(pending.cookie), consumeBotLogin(pending.cookie)]);
  expect(result.map(x => x.status).sort()).toEqual(['approved', 'expired']);
  expect(await db.auditLog.count({ where: { action: 'auth.bot.login' } })).toBe(1);
  await expect(approveBotLogin(id(pending.cookie), '12345')).rejects.toThrow('уже использована');
});
it('expires challenges and removes expired records when a new one is created', async () => {
  const pending = await createBotLogin();
  const stored = await db.setting.findUniqueOrThrow({ where: { key: `botLogin:${id(pending.cookie)}` } });
  await db.setting.update({ where: { key: stored.key }, data: { value: { ...(stored.value as object), expiresAt: Date.now() - 1000 } } });
  await expect(approveBotLogin(id(pending.cookie), '12345')).rejects.toThrow('истекла');
  expect(await consumeBotLogin(pending.cookie)).toEqual({ status: 'expired' });
  await createBotLogin(); expect(await db.setting.findUnique({ where: { key: stored.key } })).toBe(null);
});
it('rechecks a delegated admin role before session creation', async () => {
  await db.admin.create({ data: { telegramId: 777n, role: 'ADMIN' } });
  const pending = await createBotLogin(); await approveBotLogin(id(pending.cookie), '777');
  await db.admin.update({ where: { telegramId: 777n }, data: { enabled: false } });
  await expect(consumeBotLogin(pending.cookie)).rejects.toThrow('отозван');
});
it('reuses an existing browser challenge without replacing its binding', async () => {
  const pending = await createBotLogin(); expect(await createBotLogin(pending.cookie)).toEqual(pending);
});
it('invalidates pending browser cookies when AUTH_SECRET is rotated', async () => {
  const pending = await createBotLogin(); await approveBotLogin(id(pending.cookie), '12345');
  vi.stubEnv('AUTH_SECRET', 'a-different-local-auth-key-with-32-plus-characters');
  expect(await consumeBotLogin(pending.cookie)).toEqual({ status: 'expired' });
});
it('limits public challenge creation to prevent unbounded database growth', async () => {
  for (let count = 0; count < 20; count++) await createBotLogin();
  await expect(createBotLogin()).rejects.toBeInstanceOf(BotLoginLimitError);
  expect(await db.setting.count({ where: { key: { startsWith: 'botLogin:' } } })).toBe(20);
});

it('does not expose pending login records in the settings editor', async () => {
  const pending = await createBotLogin();
  const settings = await listResource('settings', '') as {key:string}[];
  expect(settings.some(row => row.key.startsWith('botLogin:') || row.key === 'botLoginRate')).toBe(false);
  expect(JSON.stringify(settings)).not.toContain(pending.cookie.split('.')[1]);
});

it('uses the verified request origin for the bot confirmation when APP_URL is stale', async () => {
  vi.stubEnv('APP_URL', 'https://old.example');
  const pending = await createBotLogin('', 'https://actual.example');
  expect(await inspectBotLogin(id(pending.cookie), '12345')).toEqual({ domain: 'actual.example' });
});
