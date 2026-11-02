import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { checkOrigin, encodeSession } from '@/lib/auth';
import { DomainError } from '@/lib/db';
import { BOT_LOGIN_COOKIE, BOT_LOGIN_COOKIE_PATH, createBotLogin, consumeBotLogin, BotLoginLimitError, BotLoginConfigError } from '@/lib/auth/bot-login';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: BOT_LOGIN_COOKIE_PATH };
function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN_ORIGIN') return NextResponse.json({ error: 'Запрос должен быть отправлен с сайта приложения.' }, { status: 403, headers });
  if (error instanceof BotLoginLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  if (error instanceof BotLoginConfigError) return NextResponse.json({ error: error.message }, { status: 503, headers });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: 403, headers });
  return NextResponse.json({ error: 'Не удалось выполнить вход. Попробуйте позже.' }, { status: 503, headers });
}
export async function POST(req: Request) {
  try {
    const requestOrigin = checkOrigin(req);
    const pending = await createBotLogin((await cookies()).get(BOT_LOGIN_COOKIE)?.value ?? '', requestOrigin);
    const response = NextResponse.json({ botUrl: pending.botUrl, expiresAt: pending.expiresAt }, { headers });
    response.cookies.set(BOT_LOGIN_COOKIE, pending.cookie, { ...cookieOptions, maxAge: Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000)) });
    return response;
  } catch (error) { return failure(error); }
}
export async function GET(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, { status: 403, headers });
  try {
    const result = await consumeBotLogin((await cookies()).get(BOT_LOGIN_COOKIE)?.value ?? '');
    const response = NextResponse.json({ status: result.status }, { status: result.status === 'expired' ? 410 : 200, headers });
    if (result.status === 'approved') {
      response.cookies.set('maksim_session', encodeSession(result.principal), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 3600, path: '/' });
    }
    if (result.status !== 'pending') response.cookies.set(BOT_LOGIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) { return failure(error); }
}
