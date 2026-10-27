import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db = globalDb.db ?? new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:5})});
if (process.env.NODE_ENV !== 'production') globalDb.db = db;
export type Tx = Prisma.TransactionClient;
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt=0; ; attempt++) {
    try { return await db.$transaction(async tx => {
      // All business writers use the same short transaction lock. PostgreSQL
      // READ COMMITTED sees the preceding writer after acquiring the lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(945714)::text`;
      return fn(tx);
    }, {isolationLevel:'ReadCommitted',maxWait:10000,timeout:30000}); }
    catch(e) { if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(e.code) && attempt<4) continue; throw e; }
  }
}
export function json(value: unknown) { return JSON.parse(JSON.stringify(value,(_,v)=> typeof v==='bigint'?v.toString():v)); }
export async function enqueue(tx: Tx, key: string, kind: string, payload: unknown, runAt=new Date()) {
  return tx.job.upsert({where:{key},create:{key,kind,payload:json(payload),runAt},update:{}});
}
export class DomainError extends Error {}
