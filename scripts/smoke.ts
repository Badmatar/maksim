import 'dotenv/config';
import { encodeSession } from '../lib/auth';
import { db } from '../lib/db';
const base=process.env.APP_URL??'http://localhost:3000';
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
async function main(){
 if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Smoke only runs against localhost');
 const owner=(process.env.OWNER_TELEGRAM_IDS??'').split(',')[0];if(!owner)throw new Error('Set a local OWNER_TELEGRAM_IDS for HTTP smoke');
 const cookie=(id:string,role:'OWNER'|'ADMIN'='OWNER')=>`maksim_session=${encodeSession({telegramId:id,role,exp:Date.now()+60000})}`;
 const headers={cookie:cookie(owner),origin:base,'Content-Type':'application/json'};
 const checks:string[]=[];
 const check=(ok:unknown,name:string)=>{assert(ok,name);checks.push(name);};
 check((await fetch(base)).status===200,'public page');
 check((await fetch(`${base}/api/health`)).status===200,'database health');
 check((await fetch(`${base}/admin`,{redirect:'manual'})).status===307,'admin redirects unauthenticated visitor');
 check((await fetch(`${base}/api/admin/users`)).status===401,'anonymous admin API denied');
 check((await fetch(`${base}/api/cron`)).status===401,'anonymous cron denied');
 check((await fetch(`${base}/api/telegram/webhook`,{method:'POST',body:'{}'})).status===401,'forged webhook denied');
 const admin=await fetch(`${base}/admin`,{headers});check(admin.status===200&&(await admin.text()).includes('CONTROL CENTER'),'authenticated admin renders');
 for(const resource of ['dashboard','analytics','users','meditations','products','events','payments','access','registrations','settings','admins','jobs','audit','consultations','broadcasts','automations'])check((await fetch(`${base}/api/admin/${resource}`,{headers})).status===200,`admin ${resource}`);
 const cross=await fetch(`${base}/api/admin/meditations`,{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'});check(cross.status===403,'cross-origin write denied');
 let meditationId:string|undefined;const adminId=900000002n;
 try{
  const res=await fetch(`${base}/api/admin/meditations`,{method:'POST',headers,body:JSON.stringify({data:{title:'HTTP smoke temporary record',description:'Temporary smoke fixture',category:'Test',durationMinutes:5,audioFileId:'smoke-only',free:true,published:false}})});const body=await res.json();check(res.status===200&&body.data?.id,'admin content write');meditationId=body.data.id;
  const list=await (await fetch(`${base}/api/admin/meditations`,{headers})).json();check(list.some((r:{id:string})=>r.id===meditationId),'admin write persisted');
  const csv=await fetch(`${base}/api/admin/export?type=users`,{headers});check(csv.status===200&&(csv.headers.get('content-type')??'').includes('text/csv'),'CSV export');
  await db.admin.upsert({where:{telegramId:adminId},create:{telegramId:adminId,role:'ADMIN'},update:{enabled:true,role:'ADMIN'}});
  const limited={cookie:cookie(adminId.toString(),'ADMIN')};check((await fetch(`${base}/api/admin/settings`,{headers:limited})).status===401,'delegated admin cannot read owner settings');
  await db.admin.update({where:{telegramId:adminId},data:{enabled:false}});check((await fetch(`${base}/api/admin/users`,{headers:limited})).status===401,'disabled admin session revoked');
 }finally{if(meditationId)await db.meditation.delete({where:{id:meditationId}});await db.admin.deleteMany({where:{telegramId:adminId}});}
 console.log(`${checks.length} HTTP checks passed`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
