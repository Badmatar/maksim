import { equal } from '@/lib/auth';
import { runWorker } from '@/lib/worker';
import { scheduleMaintenance } from '@/lib/automations';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(req:Request) {
 if(!process.env.CRON_SECRET||!equal(req.headers.get('authorization')??'',`Bearer ${process.env.CRON_SECRET}`))return new Response(null,{status:401});
 // Serialise schedulers. Per-job leases also support multiple workers.
 const { db }=await import('@/lib/db');
 const acquired=await db.$transaction(async tx=>{
  const lock=await tx.$queryRaw<{ok:boolean}[]>`SELECT pg_try_advisory_xact_lock(945712) AS ok`;
  if(!lock[0]?.ok)return false;
  const running=await tx.setting.findUnique({where:{key:'maintenanceLease'}});
  if(typeof running?.value==='number'&&running.value>Date.now())return false;
  await tx.setting.upsert({where:{key:'maintenanceLease'},create:{key:'maintenanceLease',value:Date.now()+55000},update:{value:Date.now()+55000}});return true;
 });
 if(!acquired)return Response.json({busy:true});
 try{await scheduleMaintenance();return Response.json(await runWorker());}
 finally{await db.setting.deleteMany({where:{key:'maintenanceLease'}});}
}
