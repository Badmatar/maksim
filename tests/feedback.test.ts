import {randomUUID} from 'node:crypto';
import {beforeEach,afterAll,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({cookie:'',send:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>state.cookie?{value:state.cookie}:undefined})}));
vi.mock('@/lib/bot',()=>({getBot:()=>({api:{sendMessage:state.send}})}));
import {db} from '@/lib/db';
import {POST} from '@/app/api/feedback/route';
import {listResource,saveResource} from '@/lib/admin';
import {runWorker} from '@/lib/worker';
const base='https://app.example/api/feedback';
const payload=()=>({requestId:randomUUID(),kind:'practice',message:'Было удобно читать шаги, хочется больше коротких практик.',contact:'@test_contact',rating:4,context:'Мягкое возвращение'});
function request(data:unknown,origin='https://app.example'){return new Request(base,{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(data)});}
async function submit(data:unknown){const response=await POST(request(data));const cookie=response.headers.get('set-cookie');if(cookie)state.cookie=cookie.split(';')[0].slice('maksim_feedback='.length);return response;}
beforeEach(async()=>{
 vi.stubEnv('APP_URL','https://app.example');vi.stubEnv('AUTH_SECRET','local-feedback-test-secret-more-than-32-characters');vi.stubEnv('OWNER_TELEGRAM_IDS','12345');state.cookie='';state.send.mockReset();state.send.mockResolvedValue({});
 await db.setting.deleteMany();await db.job.deleteMany();await db.admin.deleteMany();
});
afterAll(async()=>{await db.$disconnect();vi.unstubAllEnvs();});
it('stores feedback and queues a notification without inventing a verified user',async()=>{
 const before=await db.user.count();const data=payload();const response=await submit(data);
 expect(response.status).toBe(201);expect(await response.json()).toEqual({ok:true,id:data.requestId});expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(response.headers.get('set-cookie')).toContain('SameSite=strict');
 const row=await db.setting.findUniqueOrThrow({where:{key:`feedback:${data.requestId}`}});expect(row.value).toMatchObject({message:data.message,status:'new',rating:4});expect(row.value).not.toHaveProperty('browserHash');expect(await db.job.count({where:{kind:'feedback_notice'}})).toBe(1);expect(await db.user.count()).toBe(before);
});
it('acknowledges a retry even if the first cookie response was lost, without duplicate jobs',async()=>{
 const data=payload();expect((await submit(data)).status).toBe(201);state.cookie='';expect((await submit(data)).status).toBe(200);
 expect(await db.setting.count({where:{key:{startsWith:'feedback:'}}})).toBe(1);expect(await db.job.count()).toBe(1);
});
it('does not overwrite a submitted message when a request ID is reused for different content',async()=>{
 const data=payload();await submit(data);expect((await submit({...data,message:'Совсем другое сообщение для перезаписи'})).status).toBe(409);
 expect((await db.setting.findUniqueOrThrow({where:{key:`feedback:${data.requestId}`}})).value).toMatchObject({message:data.message});
});
it('rejects foreign origins and oversized actual bodies before writing anything',async()=>{
 expect((await POST(request(payload(),'https://foreign.example'))).status).toBe(403);
 expect((await POST(request({text:'a'.repeat(17000)}))).status).toBe(413);
 expect(await db.setting.count()).toBe(0);expect(await db.job.count()).toBe(0);
});
it('validates ratings and refuses forged identity fields',async()=>{
 expect((await submit({...payload(),rating:6})).status).toBe(400);expect((await submit({...payload(),telegramId:'12345'})).status).toBe(400);expect((await submit({...payload(),message:'   '})).status).toBe(400);expect(await db.job.count()).toBe(0);
});
it('limits repeated feedback per browser and leaves rejected messages out of the inbox',async()=>{
 for(let i=0;i<3;i++)expect((await submit(payload())).status).toBe(201);
 const response=await submit(payload());expect(response.status).toBe(429);expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);expect(await db.setting.count({where:{key:{startsWith:'feedback:'}}})).toBe(3);
});
it('shows the team a separate inbox and hides feedback and limits from the settings editor',async()=>{
 const data=payload();await submit(data);const inbox=await listResource('feedback','') as {id:string;text:string;status:string}[];expect(inbox).toHaveLength(1);expect(inbox[0]).toMatchObject({id:data.requestId,text:data.message,status:'new'});
 const settings=await listResource('settings','') as {key:string}[];expect(settings.some(row=>row.key.startsWith('feedback'))).toBe(false);
 await saveResource('feedback',{id:data.requestId,data:{status:'reviewed'}},'12345');expect((await listResource('feedback','') as {status:string}[])[0].status).toBe('reviewed');
});
it('delivers the queued notice to the team and retains the stored submission',async()=>{
 const data=payload();await submit(data);const result=await runWorker(1,2000);expect(result).toEqual({done:1,failed:0});expect(state.send).toHaveBeenCalledWith('12345',expect.stringContaining(data.message));expect(state.send).toHaveBeenCalledWith('12345',expect.stringContaining('Контакт (указан пользователем): @test_contact'));expect(await db.setting.findUnique({where:{key:`feedback:${data.requestId}`}})).not.toBe(null);
});
