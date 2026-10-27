import { beforeAll,beforeEach,afterAll,it,expect,vi } from 'vitest';
import { db } from '@/lib/db';
import { getBot } from '@/lib/bot';
import type { Update } from 'grammy/types';
const calls:{method:string;payload:any}[]=[];
let sequence=1000;
beforeAll(async()=>{
 vi.stubEnv('BOT_TOKEN','123456:test-only');vi.stubEnv('OWNER_TELEGRAM_IDS','12345');vi.stubEnv('COMMUNITY_CHAT_ID','-100123');
 const bot=getBot();bot.api.config.use(async(_prev,method,payload)=>{
  calls.push({method,payload});
  if(method==='getMe')return {ok:true,result:{id:123456,is_bot:true,first_name:'Bot',username:'testbot'}} as any;
  return {ok:true,result:{message_id:sequence++,date:0,chat:{id:12345,type:'private'}}} as any;
 });await bot.init();
});
beforeEach(async()=>{
 await db.$executeRawUnsafe('TRUNCATE TABLE "User", "Admin", "Meditation", "Product", "Order", "Receipt", "Entitlement", "Event", "Registration", "Invite", "Broadcast", "AutomationStep", "Job", "TelegramUpdate", "UserEvent", "Setting", "AuditLog", "Consultation" CASCADE');calls.length=0;
});
afterAll(async()=>{await db.$disconnect();vi.unstubAllEnvs();});
function message(text:string,id=12345):Update {return {update_id:sequence++,message:{message_id:sequence++,date:Math.floor(Date.now()/1000),chat:{id,type:'private',first_name:'Тест'},from:{id,is_bot:false,first_name:'Тест'},text,...(text.startsWith('/')?{entities:[{type:'bot_command' as const,offset:0,length:text.split(' ')[0].length}]}:{})}};}
function callback(data:string,id=12345):Update{return {update_id:sequence++,callback_query:{id:String(sequence++),from:{id,is_bot:false,first_name:'Тест'},chat_instance:'test',data,message:{message_id:1,date:0,chat:{id,type:'private',first_name:'Тест'},text:'Меню'}}};}
it('runs first start, free audio and repeat start preserving attribution and purchases',async()=>{
 await db.meditation.create({data:{title:'Бесплатная',description:'Тест',category:'Тест',durationMinutes:10,audioFileId:'audio-id',free:true,published:true}});
 await getBot().handleUpdate(message('/start instagram'));
 const u=await db.user.findUniqueOrThrow({where:{telegramId:12345n}});expect(u.source).toBe('instagram');expect(calls.some(c=>c.method==='sendMessage'&&c.payload.text.includes('Добро пожаловать'))).toBe(true);
 await getBot().handleUpdate(callback('free'));expect(calls.some(c=>c.method==='sendAudio'&&c.payload.audio==='audio-id')).toBe(true);expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).onboarded).toBe(true);
 calls.length=0;await getBot().handleUpdate(message('/start another-source'));expect(calls.filter(c=>c.method==='sendMessage')).toHaveLength(1);expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).source).toBe('instagram');expect(await db.user.count()).toBe(1);
});
it('does not leak paid audio to an unpaid user',async()=>{
 const m=await db.meditation.create({data:{title:'Платная',description:'Тест',category:'Тест',durationMinutes:10,audioFileId:'paid-audio',published:true}});await getBot().handleUpdate(callback(`med:${m.id}`));expect(calls.some(c=>c.method==='sendAudio')).toBe(false);
});
it('checks subscriber Telegram ID before approving a personal join request',async()=>{
 const u=await db.user.create({data:{telegramId:12345n,name:'Покупатель'}});const p=await db.product.create({data:{title:'Клуб',description:'Тест',kind:'COMMUNITY',price:100,published:true}});await db.entitlement.create({data:{userId:u.id,productId:p.id}});await db.invite.create({data:{userId:u.id,link:'https://t.me/+personal',expiresAt:new Date(Date.now()+60000)}});
 const request=(id:number):Update=>({update_id:sequence++,chat_join_request:{chat:{id:-100123,type:'supergroup',title:'Клуб'},from:{id,is_bot:false,first_name:'Запрос'},user_chat_id:id,date:0,invite_link:{invite_link:'https://t.me/+personal',creator:{id:1,is_bot:true,first_name:'Бот'},creates_join_request:true,is_primary:false,is_revoked:false}}});
 await getBot().handleUpdate(request(999));expect(calls.some(c=>c.method==='declineChatJoinRequest')).toBe(true);expect(calls.some(c=>c.method==='approveChatJoinRequest')).toBe(false);
 await getBot().handleUpdate(request(12345));expect(calls.some(c=>c.method==='approveChatJoinRequest')).toBe(true);expect((await db.invite.findFirstOrThrow()).usedAt).not.toBe(null);
});
it('requires explicit marketing consent and unsubscribe prevents later marketing',async()=>{
 await db.automationStep.create({data:{title:'День 1',delayDays:1,text:'Практика'}});await getBot().handleUpdate(message('/start'));let u=await db.user.findUniqueOrThrow({where:{telegramId:12345n}});expect(u.marketingConsent).toBe(false);
 await getBot().handleUpdate(callback('consent'));u=await db.user.findUniqueOrThrow({where:{id:u.id}});expect(u.marketingConsent).toBe(true);expect(await db.job.count({where:{kind:'automation'}})).toBe(1);await getBot().handleUpdate(message('/unsubscribe'));expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).marketingConsent).toBe(false);
});
it('denies forged admin payment callbacks and ignores group commands',async()=>{
 await getBot().handleUpdate(callback('approve:nonexistent',999));expect(calls.some(c=>c.method==='sendMessage'&&c.payload.text==='Недостаточно прав')).toBe(true);
 const update=message('/start',777) as any;update.message.chat={id:-123,type:'group',title:'Группа'};calls.length=0;await getBot().handleUpdate(update);expect(calls.length).toBe(0);expect(await db.user.findUnique({where:{telegramId:777n}})).toBe(null);
});
