import { equal } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  if (!process.env.WEBHOOK_SECRET || !equal(req.headers.get('x-telegram-bot-api-secret-token') ?? '', process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  // Report presence only. Never expose credential values, users or job payloads.
  const configured = Object.fromEntries(['BOT_TOKEN', 'WEBHOOK_SECRET', 'CRON_SECRET', 'DATABASE_URL', 'OWNER_TELEGRAM_IDS', 'NEXT_PUBLIC_BOT_USERNAME'].map(name => [name, Boolean(process.env[name]?.trim())]));
  try {
    await db.$queryRaw`SELECT 1`;
    const [jobs, status, failures] = await Promise.all([
      db.job.groupBy({ by: ['kind', 'status'], _count: true }),
      db.setting.findUnique({ where: { key: 'schedulerStatus' } }),
      db.job.findMany({ where: { status: 'failed' }, select: { lastError: true }, take: 20 }),
    ]);
    const failureTypes: Record<string, number> = {};
    for (const job of failures) {
      const message = job.lastError ?? '';
      const type = message.includes('BOT_TOKEN is not configured') ? 'BOT_TOKEN_missing_in_Vercel'
        : /\b401\b|Unauthorized/i.test(message) ? 'telegram_authorization_error'
        : message.includes('query_compiler_bg.wasm') ? 'Prisma_compiler_missing'
        : message.includes('COMMUNITY_CHAT_ID missing') ? 'community_not_configured'
        : 'other_check_admin_queue';
      failureTypes[type] = (failureTypes[type] ?? 0) + 1;
    }
    const value = status?.value as Record<string, unknown> | undefined;
    const scheduler: Record<string, unknown> = {};
    if (value && typeof value === 'object') {
      if (['ok', 'error', 'completed_with_failures'].includes(String(value.status))) scheduler.status = value.status;
      for (const key of ['startedAt', 'completedAt']) {
        if (typeof value[key] === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value[key])) scheduler[key] = value[key];
      }
      for (const key of ['done', 'failed']) if (typeof value[key] === 'number') scheduler[key] = value[key];
    }
    return Response.json({ database: 'ok', configured, botUsername: /^[A-Za-z0-9_]{5,32}$/.test(process.env.NEXT_PUBLIC_BOT_USERNAME ?? '') ? process.env.NEXT_PUBLIC_BOT_USERNAME : null, jobs, scheduler, failureTypes }, { headers });
  } catch {
    return Response.json({ database: 'unavailable', configured }, { status: 503, headers });
  }
}
