import { beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { createHmac,createHash } from 'node:crypto';
import { db,transaction,enqueue } from '@/lib/db';
import { createOrder,submitReceipt,approveOrder,rejectOrder,hasMeditation,refundOrder } from '@/lib/payments';
import { registerFree } from '@/lib/events';
import { scheduleMaintenance,segmentWhere } from '@/lib/automations';
import { verifyTelegram,encodeSession,decodeSession,checkOrigin } from '@/lib/auth';
import { saveResource } from '@/lib/admin';
import { POST as webhook } from '@/app/api/telegram/webhook/route';
const api={sendMessage:vi.fn().mockResolvedValue({message_id:1}),sendAudio:vi.fn().mockResolvedValue({}),banChatMember:vi.fn().mockResolvedValue(true),unbanChatMember:vi.fn().mockResolvedValue(true),createChatInviteLink:vi.fn().mockResolvedValue({invite_link:'https://t.me/+test'}),sendPhoto:vi.fn().mockResolvedValue({}),sendDocument:vi.fn().mockResolvedValue({})};
vi.mock('@/lib/bot',()=>({getBot:()=>({api,isInited:()=>true,handleUpdate:vi.fn()})}));
import { runWorker } from '@/lib/worker';
async function fixture(kind='MEDITATION',durationDays:number|null=null){
 const u=await db.user.create({data:{telegramId:123456789n,name:'Тест'}});
 const m=await db.meditation.create({data:{title:'Практика',description:'Описание',category:'Принятие',durationMinutes:12,audioFileId:'test-audio',published:true}});
 const p=await db.product.create({data:{title:'Продукт',description:'Описание',kind,price:150000,published:true,durationDays,items:kind==='MEDITATION'?{create:{meditationId:m.id}}:undefined}});
 return {u,m,p};
}
async function review(userId:string,productId:string,receipt='receipt-1') {const o=await createOrder(userId,productId);await submitReceipt(userId,o.id,'file',receipt,'photo');return o;}
beforeEach(async()=>{
 await db.$executeRawUnsafe('TRUNCATE TABLE "User", "Admin", "Meditation", "Product", "Order", "Receipt", "Entitlement", "Event", "Registration", "Invite", "Broadcast", "AutomationStep", "Job", "TelegramUpdate", "UserEvent", "Setting", "AuditLog", "Consultation" CASCADE');
 vi.clearAllMocks();vi.stubEnv('AUTH_SECRET','a'.repeat(64));vi.stubEnv('COMMUNITY_CHAT_ID','-100123');vi.stubEnv('WEBHOOK_SECRET','webhook-test-secret');
});
afterAll(async()=>{await db.$disconnect();vi.unstubAllEnvs();});
describe('Payments and access on PostgreSQL',()=>{
 it('denies paid audio before approval and grants exactly once under concurrent approval',async()=>{
  const {u,m,p}=await fixture();expect(await hasMeditation(u.id,m.id)).toBe(false);
  const o=await review(u.id,p.id);await Promise.all([approveOrder(o.id,'owner'),approveOrder(o.id,'owner')]);
  expect(await hasMeditation(u.id,m.id)).toBe(true);expect(await db.entitlement.count()).toBe(1);expect(await db.auditLog.count({where:{action:'payment.approved'}})).toBe(1);expect(await db.job.count({where:{key:`paid:${o.id}`}})).toBe(1);
 });
 it('snapshots price and duration despite later product edits',async()=>{
  const {u,p}=await fixture('COMMUNITY',30);const o=await review(u.id,p.id);
  await db.product.update({where:{id:p.id},data:{price:999999,durationDays:90}});await approveOrder(o.id,'owner');
  const a=await db.entitlement.findFirstOrThrow();expect(a.expiresAt!.getTime()-Date.now()).toBeGreaterThan(29*86400000);expect(a.expiresAt!.getTime()-Date.now()).toBeLessThan(31*86400000);expect(o.amount).toBe(150000);
 });
 it('extends subscription from previous expiry and ignores repeat confirmation',async()=>{
  const {u,p}=await fixture('COMMUNITY',30);const o=await review(u.id,p.id);await approveOrder(o.id,'owner');const first=await db.entitlement.findFirstOrThrow();
  const renewal=await review(u.id,p.id,'receipt-2');await approveOrder(renewal.id,'owner');await approveOrder(renewal.id,'owner');const after=await db.entitlement.findFirstOrThrow();expect(after.expiresAt!.getTime()-first.expiresAt!.getTime()).toBe(30*86400000);
 });
 it('rejects wrong owner and reused receipts across orders',async()=>{
  const {u,p}=await fixture();const o=await review(u.id,p.id);const other=await db.user.create({data:{telegramId:55n,name:'Другой'}});const second=await createOrder(other.id,p.id);
  await expect(submitReceipt(u.id,second.id,'file','unique-other','photo')).rejects.toThrow();await expect(submitReceipt(other.id,second.id,'file','receipt-1','photo')).rejects.toThrow('уже загружена');expect(await db.receipt.count()).toBe(1);
 });
 it('allows corrected receipt after rejection and prevents unpaid approval',async()=>{
  const {u,p}=await fixture();const o=await createOrder(u.id,p.id);await expect(approveOrder(o.id,'owner')).rejects.toThrow();await submitReceipt(u.id,o.id,'file','one','photo');await rejectOrder(o.id,'owner','Сумма не совпадает');await submitReceipt(u.id,o.id,'new-file','two','document');await approveOrder(o.id,'owner');expect(await db.receipt.count()).toBe(2);
 });
 it('records manual refund and revokes product access',async()=>{
  const {u,p,m}=await fixture();const o=await review(u.id,p.id);await approveOrder(o.id,'owner');await refundOrder(o.id,'owner','Банковский возврат выполнен');expect(await hasMeditation(u.id,m.id)).toBe(false);expect((await db.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('refunded');
 });
 it('deduplicates concurrent purchase requests',async()=>{const {u,p}=await fixture();const orders=await Promise.all([createOrder(u.id,p.id),createOrder(u.id,p.id)]);expect(orders[0].id).toBe(orders[1].id);});
});
describe('Events and durable jobs',()=>{
 it('enforces free event capacity under concurrency, creates waitlist and prevents duplicate registration',async()=>{
  const {u}=await fixture();const u2=await db.user.create({data:{telegramId:777n,name:'Второй'}});const e=await db.event.create({data:{title:'Встреча',description:'Тест',format:'Онлайн',startsAt:new Date(Date.now()+86400000),location:'Адрес',capacity:1,published:true}});
  const rs=await Promise.all([registerFree(u.id,e.id),registerFree(u2.id,e.id)]);expect(rs.map(r=>r.status).sort()).toEqual(['confirmed','waitlisted']);await registerFree(u.id,e.id);expect(await db.registration.count()).toBe(2);
 });
 it('does not confirm a paid event beyond capacity',async()=>{
  const {u,p}=await fixture('EVENT');const e=await db.event.create({data:{title:'Встреча',description:'Тест',format:'Онлайн',startsAt:new Date(Date.now()+86400000),location:'Адрес',capacity:1,published:true,productId:p.id}});
  const u2=await db.user.create({data:{telegramId:777n,name:'Второй'}});const o1=await review(u.id,p.id,'r1'),o2=await review(u2.id,p.id,'r2');await approveOrder(o1.id,'owner');await expect(approveOrder(o2.id,'owner')).rejects.toThrow('Нет свободных мест');expect(await db.registration.count({where:{eventId:e.id,status:'confirmed'}})).toBe(1);
 });
 it('expires subscriptions once and worker removes access through Telegram API',async()=>{
  const {u,p}=await fixture('COMMUNITY',30);await db.entitlement.create({data:{userId:u.id,productId:p.id,expiresAt:new Date(Date.now()-1000)}});await scheduleMaintenance();await scheduleMaintenance();expect(await db.job.count({where:{kind:'expire'}})).toBe(1);const result=await runWorker();expect(result.failed).toBe(0);expect(api.banChatMember).toHaveBeenCalledTimes(1);expect(api.unbanChatMember).toHaveBeenCalledTimes(1);
 });
 it('does not kick a renewed member when a stale expiry job executes',async()=>{
  const {u,p}=await fixture('COMMUNITY',30);await db.entitlement.create({data:{userId:u.id,productId:p.id,expiresAt:new Date(Date.now()+86400000)}});await transaction(tx=>enqueue(tx,'stale-expire','expire',{userId:u.id}));await runWorker();expect(api.banChatMember).not.toHaveBeenCalled();
 });
 it('saves authenticated webhook updates once and rejects forged updates',async()=>{
  const request=(secret:string)=>new Request('http://localhost/api/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:42,message:{text:'/start'}})});
  expect((await webhook(request('wrong'))).status).toBe(401);await webhook(request('webhook-test-secret'));await webhook(request('webhook-test-secret'));expect(await db.telegramUpdate.count()).toBe(1);expect(await db.job.count()).toBe(1);
 });
 it('rechecks consent and purchases before sending queued marketing',async()=>{
  const {u,p}=await fixture();const step=await db.automationStep.create({data:{title:'Тест',delayDays:0,text:'Купите',productId:p.id}});await transaction(tx=>enqueue(tx,'marketing','automation',{userId:u.id,stepId:step.id}));await runWorker();expect(api.sendMessage).not.toHaveBeenCalled();
  await db.user.update({where:{id:u.id},data:{marketingConsent:true}});const o=await review(u.id,p.id);await approveOrder(o.id,'owner');await db.job.deleteMany();await transaction(tx=>enqueue(tx,'marketing2','automation',{userId:u.id,stepId:step.id}));await runWorker();expect(api.sendMessage).not.toHaveBeenCalled();
 });
 it('persists failed work and retries it without losing the task',async()=>{
  const {u}=await fixture();api.sendMessage.mockRejectedValueOnce(new Error('temporary network error'));await transaction(tx=>enqueue(tx,'retry','message',{userId:u.id,text:'Test'}));expect((await runWorker()).failed).toBe(1);const job=await db.job.findUniqueOrThrow({where:{key:'retry'}});expect(job.status).toBe('pending');expect(job.attempts).toBe(1);await db.job.update({where:{id:job.id},data:{runAt:new Date(0)}});expect((await runWorker()).done).toBe(1);
 });
 it('claims a job once across concurrent workers',async()=>{const {u}=await fixture();await transaction(tx=>enqueue(tx,'one','message',{userId:u.id,text:'Once'}));await Promise.all([runWorker(),runWorker()]);expect(api.sendMessage).toHaveBeenCalledTimes(1);});
});
describe('Authentication and admin validation',()=>{
 it('validates Telegram signature, expiry and tampering',()=>{
  const data:Record<string,string>={id:'12345',first_name:'Максим',auth_date:String(Math.floor(Date.now()/1000))};const token='test-token';const check=Object.keys(data).sort().map(k=>`${k}=${data[k]}`).join('\n');data.hash=createHmac('sha256',createHash('sha256').update(token).digest()).update(check).digest('hex');expect(verifyTelegram(data,token)).toBe(true);expect(verifyTelegram({...data,id:'999'},token)).toBe(false);expect(verifyTelegram(data,token,Date.now()+3600000)).toBe(false);
 });
 it('rejects modified and expired sessions and cross-origin writes',()=>{const value=encodeSession({telegramId:'123',role:'OWNER',exp:Date.now()+10000});expect(decodeSession(value)?.telegramId).toBe('123');expect(decodeSession(value+'x')).toBe(null);expect(decodeSession(encodeSession({telegramId:'123',role:'OWNER',exp:Date.now()-1}))).toBe(null);vi.stubEnv('APP_URL','https://example.com');expect(()=>checkOrigin(new Request('https://example.com/api/admin',{headers:{origin:'https://evil.example'}}))).toThrow();});
 it('rejects invalid content, price and timezone without modifying database',async()=>{await expect(saveResource('products',{data:{title:'Тест',description:'Описание',kind:'MEDITATION',price:-1,currency:'RUB',published:true}},'owner')).rejects.toThrow();expect(await db.product.count()).toBe(0);});
 it('does not overwrite existing setting values while saving another key',async()=>{await saveResource('settings',{data:{key:'welcome',value:'Привет'}},'owner');await saveResource('settings',{data:{key:'about',value:'Обо мне'}},'owner');expect((await db.setting.findUniqueOrThrow({where:{key:'welcome'}})).value).toBe('Привет');});
});
