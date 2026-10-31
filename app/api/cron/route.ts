import { after } from 'next/server';
import { equal } from '@/lib/auth';
import { runWorker } from '@/lib/worker';
import { scheduleMaintenance } from '@/lib/automations';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !equal(req.headers.get('authorization') ?? '', `Bearer ${process.env.CRON_SECRET}`)) {
    return new Response(null, { status: 401 });
  }

  const startedAt = new Date();
  const leaseUntil = Date.now() + 65_000;
  const { db } = await import('@/lib/db');
  const acquired = await db.$transaction(async tx => {
    const lock = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(945712) AS ok`;
    if (!lock[0]?.ok) return false;
    const running = await tx.setting.findUnique({ where: { key: 'maintenanceLease' } });
    if (typeof running?.value === 'number' && running.value > Date.now()) return false;
    await tx.setting.upsert({
      where: { key: 'maintenanceLease' },
      create: { key: 'maintenanceLease', value: leaseUntil },
      update: { value: leaseUntil },
    });
    return true;
  });

  const headers = { 'Cache-Control': 'no-store' };
  if (!acquired) return Response.json({ busy: true }, { headers });

  // Next.js after() keeps this work alive on Vercel after the HTTP response.
  // External schedulers receive a quick acknowledgement instead of waiting for Telegram.
  after(async () => {
    try {
      await scheduleMaintenance();
      const budgetMs = Math.max(0, 45_000 - (Date.now() - startedAt.getTime()));
      const result = await runWorker(20, budgetMs);
      const value = {
        status: result.failed ? 'completed_with_failures' : 'ok',
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        ...result,
      };
      await db.setting.upsert({ where: { key: 'schedulerStatus' }, create: { key: 'schedulerStatus', value }, update: { value } });
    } catch {
      // Do not log raw database/HTTP errors that might contain credentials.
      console.error('Scheduled processing failed. Check the queue and database connection.');
      try {
        const value = { status: 'error', startedAt: startedAt.toISOString(), completedAt: new Date().toISOString() };
        await db.setting.upsert({ where: { key: 'schedulerStatus' }, create: { key: 'schedulerStatus', value }, update: { value } });
      } catch {
        console.error('Could not persist scheduler status.');
      }
    } finally {
      try {
        // A late callback must not delete a newer request's lease.
        await db.setting.deleteMany({ where: { key: 'maintenanceLease', value: { equals: leaseUntil } } });
      } catch {
        console.error('Could not release scheduler lease; it will expire automatically.');
      }
    }
  });

  return Response.json({ accepted: true }, { headers });
}
