import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  lockAvailable: true,
  lease: null as null | { value: number },
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  worker: vi.fn(),
  maintenance: vi.fn(),
}));
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => state.callbacks.push(fn) }));
vi.mock('@/lib/db', () => ({ db: {
  $transaction: state.transaction,
  setting: { upsert: state.upsert, deleteMany: state.deleteMany },
} }));
vi.mock('@/lib/worker', () => ({ runWorker: state.worker }));
vi.mock('@/lib/automations', () => ({ scheduleMaintenance: state.maintenance }));
import { GET } from '@/app/api/cron/route';
const request = (authorization = 'Bearer local-scheduler-test') => new Request('https://example.vercel.app/api/cron', { headers: { authorization } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'local-scheduler-test');
  state.callbacks.length = 0;
  state.lockAvailable = true;
  state.lease = null;
  state.findUnique.mockImplementation(async () => state.lease);
  state.upsert.mockResolvedValue({});
  state.deleteMany.mockResolvedValue({ count: 1 });
  state.worker.mockResolvedValue({ done: 2, failed: 0 });
  state.maintenance.mockResolvedValue(undefined);
  state.transaction.mockImplementation(async fn => fn({
    $queryRaw: async () => [{ ok: state.lockAvailable }],
    setting: { findUnique: state.findUnique, upsert: state.upsert },
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('External scheduler endpoint', () => {
  it('rejects a missing or wrong secret before touching the database', async () => {
    for (const header of ['', 'Bearer wrong']) expect((await GET(request(header))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(401);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.callbacks).toHaveLength(0);
  });
  it('acknowledges the request before starting maintenance or Telegram jobs', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(state.worker).not.toHaveBeenCalled();
    expect(state.maintenance).not.toHaveBeenCalled();
    expect(state.callbacks).toHaveLength(1);
    await state.callbacks[0]();
    expect(state.maintenance).toHaveBeenCalledOnce();
    expect(state.worker).toHaveBeenCalledWith(20, expect.any(Number));
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'schedulerStatus' },
      update: { value: expect.objectContaining({ status: 'ok', done: 2, failed: 0 }) },
    }));
  });
  it('does not start a second batch while an active lease exists', async () => {
    state.lease = { value: Date.now() + 60_000 };
    expect(await (await GET(request())).json()).toEqual({ busy: true });
    expect(state.callbacks).toHaveLength(0);
  });
  it('does not start another batch when the database advisory lock is busy', async () => {
    state.lockAvailable = false;
    expect(await (await GET(request())).json()).toEqual({ busy: true });
    expect(state.callbacks).toHaveLength(0);
  });
  it('reclaims an expired lease and only releases the exact lease it acquired', async () => {
    state.lease = { value: Date.now() - 1000 };
    await GET(request());
    const acquired = state.upsert.mock.calls[0][0].create.value;
    await state.callbacks[0]();
    expect(state.deleteMany).toHaveBeenCalledWith({ where: { key: 'maintenanceLease', value: { equals: acquired } } });
  });
  it('records background failure and releases the lease without printing raw secrets', async () => {
    state.maintenance.mockRejectedValueOnce(new Error('Sensitive connection string must not be logged'));
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    await GET(request());
    await state.callbacks[0]();
    expect(state.worker).not.toHaveBeenCalled();
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'schedulerStatus' }, update: { value: expect.objectContaining({ status: 'error' }) },
    }));
    expect(state.deleteMany).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.mock.calls)).not.toContain('Sensitive connection');
  });
  it('distinguishes completed jobs from jobs that failed and need retry', async () => {
    state.worker.mockResolvedValueOnce({ done: 1, failed: 1 });
    await GET(request());
    await state.callbacks[0]();
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'schedulerStatus' }, update: { value: expect.objectContaining({ status: 'completed_with_failures', done: 1, failed: 1 }) },
    }));
  });
});
