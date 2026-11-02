import { createHash, createHmac, randomBytes } from 'node:crypto';
import { db, transaction, DomainError, type Tx } from '@/lib/db';
import { equal, roleFor, type Principal } from '@/lib/auth';

export const BOT_LOGIN_COOKIE = 'maksim_bot_login';
export const BOT_LOGIN_COOKIE_PATH = '/api/auth/bot';
export const BOT_LOGIN_TTL = 5 * 60_000;
const PREFIX = 'botLogin:';
type Challenge = { browserHash: string; expiresAt: number; state: 'pending' | 'approved' | 'consumed'; origin: string; telegramId?: string };
export class BotLoginLimitError extends Error {}
export class BotLoginConfigError extends Error {}

function authKey() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new BotLoginConfigError('Для входа нужен AUTH_SECRET длиной не менее 32 символов.');
  return value;
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function signature(value: string) { return createHmac('sha256', authKey()).update(`bot-login.${value}`).digest('base64url'); }
function cookieParts(cookie: string) {
  const parts = cookie.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]{32}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  if (!equal(signature(unsigned), parts[2])) return null;
  return { id: parts[0], browserHash: digest(parts[1]) };
}
function challenge(value: unknown): Challenge | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Challenge;
  return typeof c.browserHash === 'string' && typeof c.expiresAt === 'number' && ['pending', 'approved', 'consumed'].includes(c.state) ? c : null;
}
function config(requestOrigin?: string) {
  authKey();
  const username = process.env.NEXT_PUBLIC_BOT_USERNAME ?? '';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username) || !process.env.BOT_TOKEN?.trim()) throw new BotLoginConfigError('Проверьте BOT_TOKEN и NEXT_PUBLIC_BOT_USERNAME в настройках сервера.');
  let app: URL;
  try { app = new URL(requestOrigin ?? process.env.APP_URL ?? ''); } catch { throw new BotLoginConfigError('Проверьте APP_URL в настройках сервера.'); }
  if (app.username || app.password || app.search || app.hash || app.pathname !== '/' || (app.protocol !== 'https:' && !(app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname)))) throw new BotLoginConfigError('APP_URL должен содержать только адрес приложения.');
  return { username, origin: app.origin };
}
export async function createBotLogin(existingCookie = '', requestOrigin?: string) {
  const { username, origin } = config(requestOrigin);
  const existing = cookieParts(existingCookie);
  if (existing) {
    const c = challenge((await db.setting.findUnique({ where: { key: PREFIX + existing.id } }))?.value);
    if (c && c.expiresAt > Date.now() && c.state !== 'consumed' && equal(c.browserHash, existing.browserHash) && c.origin === origin) {
      return { cookie: existingCookie, botUrl: `https://t.me/${username}?start=login_${existing.id}`, expiresAt: c.expiresAt };
    }
  }
  return transaction(async tx => {
    const now = Date.now();
    const saved = await tx.setting.findUnique({ where: { key: 'botLoginRate' } });
    const rate = saved?.value as { startsAt?: number; count?: number } | undefined;
    const sameWindow = typeof rate?.startsAt === 'number' && now - rate.startsAt < 60_000;
    const count = sameWindow ? Number(rate?.count ?? 0) : 0;
    if (count >= 20) throw new BotLoginLimitError('Слишком много запросов входа. Подождите минуту и повторите.');
    const nextRate = { startsAt: sameWindow ? rate!.startsAt! : now, count: count + 1 };
    await tx.setting.upsert({ where: { key: 'botLoginRate' }, create: { key: 'botLoginRate', value: nextRate }, update: { value: nextRate } });
    await tx.setting.deleteMany({ where: { key: { startsWith: PREFIX }, value: { path: ['expiresAt'], lte: now } } });
    const id = randomBytes(24).toString('base64url');
    const browserSecret = randomBytes(32).toString('base64url');
    const c: Challenge = { browserHash: digest(browserSecret), expiresAt: now + BOT_LOGIN_TTL, state: 'pending', origin };
    await tx.setting.create({ data: { key: PREFIX + id, value: c } });
    const unsigned = `${id}.${browserSecret}`;
    return { cookie: `${unsigned}.${signature(unsigned)}`, botUrl: `https://t.me/${username}?start=login_${id}`, expiresAt: c.expiresAt };
  });
}
async function forApproval(tx: Tx, id: string, telegramId: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id) || !/^\d+$/.test(telegramId)) throw new DomainError('Ссылка входа недействительна. Начните вход заново на сайте.');
  if (!await roleFor(telegramId, tx)) throw new DomainError('Вход доступен только владельцу и приглашённым администраторам.');
  const c = challenge((await tx.setting.findUnique({ where: { key: PREFIX + id } }))?.value);
  if (!c || c.expiresAt <= Date.now() || c.state === 'consumed') throw new DomainError('Ссылка входа истекла или уже использована. Начните вход заново на сайте.');
  if (c.telegramId && c.telegramId !== telegramId) throw new DomainError('Этот запрос уже подтверждён другим администратором.');
  return c;
}
export async function inspectBotLogin(id: string, telegramId: string) {
  return transaction(async tx => {
    const c = await forApproval(tx, id, telegramId);
    return { domain: new URL(c.origin).host };
  });
}
export async function approveBotLogin(id: string, telegramId: string) {
  return transaction(async tx => {
    const c = await forApproval(tx, id, telegramId);
    if (c.state === 'approved') return;
    await tx.setting.update({ where: { key: PREFIX + id }, data: { value: { ...c, state: 'approved', telegramId } } });
    await tx.auditLog.create({ data: { actor: telegramId, action: 'auth.bot.approved', target: id } });
  });
}
export async function consumeBotLogin(cookie: string): Promise<{ status: 'pending' | 'expired' } | { status: 'approved'; principal: Principal }> {
  const parts = cookieParts(cookie);
  if (!parts) return { status: 'expired' };
  return transaction(async tx => {
    const c = challenge((await tx.setting.findUnique({ where: { key: PREFIX + parts.id } }))?.value);
    if (!c || c.expiresAt <= Date.now() || c.state === 'consumed' || !equal(c.browserHash, parts.browserHash)) return { status: 'expired' };
    if (c.state === 'pending') return { status: 'pending' };
    if (!c.telegramId || !/^\d+$/.test(c.telegramId)) return { status: 'expired' };
    const role = await roleFor(c.telegramId, tx);
    if (!role) throw new DomainError('Доступ администратора отозван. Обратитесь к владельцу.');
    await tx.setting.update({ where: { key: PREFIX + parts.id }, data: { value: { ...c, state: 'consumed' } } });
    await tx.auditLog.create({ data: { actor: c.telegramId, action: 'auth.bot.login', target: parts.id } });
    return { status: 'approved', principal: { telegramId: c.telegramId, role, exp: Date.now() + 8 * 3_600_000 } };
  });
}
