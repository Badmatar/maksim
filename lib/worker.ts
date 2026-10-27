import { db, transaction, enqueue } from '@/lib/db';
import { getBot } from '@/lib/bot';
import { InlineKeyboard, GrammyError } from 'grammy';
import { broadcastPage, segmentWhere } from '@/lib/automations';
import { money } from '@/lib/content';
import { hasMeditation } from '@/lib/payments';
import type { Update } from 'grammy/types';
const communityActive=(userId:string)=>db.entitlement.findFirst({where:{userId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],product:{kind:'COMMUNITY'}}});
async function recipient(userId:string){return db.user.findUniqueOrThrow({where:{id:userId}});}
async function send(userId:string,text:string){const u=await recipient(userId);if(!u.blocked)await getBot().api.sendMessage(u.telegramId.toString(),text);}
async function admins(){const saved=await db.admin.findMany({where:{enabled:true}});return [...new Set([...(process.env.OWNER_TELEGRAM_IDS??'').split(',').map(x=>x.trim()).filter(Boolean),...saved.map(a=>a.telegramId.toString())])];}
export async function makeInvite(userId:string){
 if(!process.env.COMMUNITY_CHAT_ID)throw new Error('COMMUNITY_CHAT_ID missing');
 if(!await communityActive(userId))return;
 const u=await recipient(userId),bot=getBot();
 const cached=await db.invite.findFirst({where:{userId,usedAt:null,expiresAt:{gt:new Date()}},orderBy:{expiresAt:'desc'}});
 let link=cached?.link;
 if(!link) {
  const expiresAt=new Date(Date.now()+3600000);
  const result=await bot.api.createChatInviteLink(process.env.COMMUNITY_CHAT_ID,{creates_join_request:true,expire_date:Math.floor(expiresAt.getTime()/1000),name:userId.slice(-24)});
  link=result.invite_link;
  await db.invite.create({data:{userId,link,expiresAt}});
 }
 // Requests are checked by Telegram ID. Join-request links cannot have member_limit.
 await bot.api.sendMessage(u.telegramId.toString(),`Персональное приглашение, действует один час: ${link}\nБот одобрит только вашу заявку.`);
}
async function processJob(kind:string,p:any) {
 const bot=getBot();
 switch(kind){
  case 'telegram_update': {const u=await db.telegramUpdate.findUniqueOrThrow({where:{id:BigInt(p.updateId)}});if(!bot.isInited())await bot.init();await bot.handleUpdate(u.payload as unknown as Update);break;}
  case 'message':await send(p.userId,p.text);break;
  case 'receipt_notice': {
   const order=await db.order.findUniqueOrThrow({where:{id:p.orderId},include:{user:true,product:true}});
   for(const id of await admins()) {
    const options={caption:`Заказ ${order.id}\n${order.product.title}\n${money(order.amount,order.currency)}\n${order.user.name} · ID ${order.user.telegramId}\nСверьте поступление с выпиской!`,reply_markup:new InlineKeyboard().text('Подтвердить',`approve:${order.id}`).text('Отклонить',`reject:${order.id}`)};
    if(p.mediaType==='photo')await bot.api.sendPhoto(id,p.fileId,options);else await bot.api.sendDocument(id,p.fileId,options);
   }break;
  }
  case 'paid': {
   const o=await db.order.findUniqueOrThrow({where:{id:p.orderId},include:{product:{include:{items:{include:{meditation:true}}}}}});
   if(o.status!=='paid')return;
   await send(o.userId,`Оплата подтверждена. Доступ к «${o.product.title}» открыт.`);
   if(o.kind==='COMMUNITY')await makeInvite(o.userId);
   if(o.eventId){const e=await db.event.findUniqueOrThrow({where:{id:o.eventId}});await send(o.userId,`Вы записаны на ${e.title}. ${e.startsAt.toLocaleString('ru-RU',{timeZone:e.timezone})} (${e.timezone}). ${e.location}`);}
   for(const item of o.product.items){const u=await recipient(o.userId);if(await hasMeditation(o.userId,item.meditationId))await bot.api.sendAudio(u.telegramId.toString(),item.meditation.audioFileId,{caption:item.meditation.title});}
   break;
  }
  case 'invite':await makeInvite(p.userId);break;
  case 'expire': {
   const removed=await transaction(async tx=>{
    const active=await tx.entitlement.findFirst({where:{userId:p.userId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],product:{kind:'COMMUNITY'}}});
    if(active)return false;
    const u=await tx.user.findUniqueOrThrow({where:{id:p.userId}});if(!process.env.COMMUNITY_CHAT_ID)throw new Error('COMMUNITY_CHAT_ID missing');
    // Renewal uses the same transaction lock, preventing a kick after a concurrent renewal.
    await bot.api.banChatMember(process.env.COMMUNITY_CHAT_ID,Number(u.telegramId));
    await bot.api.unbanChatMember(process.env.COMMUNITY_CHAT_ID,Number(u.telegramId),{only_if_banned:true});
    return true;
   });
   if(!removed)return;
   await send(p.userId,'Срок доступа к сообществу завершился. Продлите подписку в разделе «Сообщество».');break;
  }
  case 'expiry_reminder': {
   const a=await db.entitlement.findUnique({where:{id:p.entitlementId}});
   if(a&&!a.revokedAt&&a.expiresAt?.toISOString()===p.expiresAt)await send(p.userId,`Ваш доступ завершится ${a.expiresAt!.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}. Продлить можно в разделе «Мой доступ».`);break;
  }
  case 'event_reminder': {
   const r=await db.registration.findUnique({where:{userId_eventId:{userId:p.userId,eventId:p.eventId}},include:{event:true}});
   if(r?.status==='confirmed'&&r.event.published&&r.event.startsAt>new Date()&&r.event.startsAt.getTime()<=Date.now()+86400000)await send(p.userId,`Напоминаем: ${r.event.title}, ${r.event.startsAt.toLocaleString('ru-RU',{timeZone:r.event.timezone})} (${r.event.timezone}). ${r.event.location}`);break;
  }
  case 'consultation': {const c=await db.consultation.findUniqueOrThrow({where:{id:p.id},include:{user:true}});for(const id of await admins())await bot.api.sendMessage(id,`Запрос консультации от ${c.user.name}, Telegram ID ${c.user.telegramId}${c.user.username?` (@${c.user.username})`:''}\n${c.text}`);break;}
  case 'broadcast_page':await broadcastPage(p.broadcastId,p.cursor);break;
  case 'broadcast_message': {
   const b=await db.broadcast.findUniqueOrThrow({where:{id:p.broadcastId}});
   const u=await db.user.findFirst({where:{id:p.userId,marketingConsent:true,blocked:false,...segmentWhere(b.segment,b.eventId)}});
   if(u&&b.status!=='cancelled'){await send(u.id,`${b.text}\n\nОтписаться: /unsubscribe`);await db.userEvent.create({data:{userId:u.id,type:'broadcast_sent',target:b.id}});}break;
  }
  case 'automation': {
   const s=await db.automationStep.findUnique({where:{id:p.stepId}}),u=await recipient(p.userId);
   if(!s?.enabled||!u.marketingConsent||u.blocked)return;
   if(s.productId&&await db.order.findFirst({where:{userId:u.id,productId:s.productId,status:'paid'}}))return;
   await send(u.id,`${s.text}\n\nОтписаться: /unsubscribe`);await db.userEvent.create({data:{userId:u.id,type:'automation_sent',target:s.id}});break;
  }
  default:throw new Error(`Unknown job type: ${kind}`);
 }
}
export async function runWorker(limit=20,budgetMs=45000) {
 const started=Date.now();let done=0,failed=0;
 while(done+failed<limit&&Date.now()-started<budgetMs) {
  // A lease token is lockedAt. A stale worker cannot acknowledge a reclaimed job.
  const jobs=await db.$queryRaw<{id:string;kind:string;payload:any;attempts:number;lockedAt:Date}[]>`
   UPDATE "Job" SET status='running', "lockedAt"=NOW(), attempts=attempts+1
   WHERE id=(SELECT id FROM "Job" WHERE ((status='pending' AND "runAt"<=NOW()) OR (status='running' AND "lockedAt"<NOW()-INTERVAL '5 minutes'))
   ORDER BY "runAt", "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
   RETURNING id,kind,payload,attempts,"lockedAt"`;
  const job=jobs[0];if(!job)break;
  try {await processJob(job.kind,job.payload);await db.job.updateMany({where:{id:job.id,lockedAt:job.lockedAt},data:{status:'done',lastError:null}});done++;}
  catch(error) {
   const e=error instanceof Error?error:new Error('Unknown error');
   // Never persist request URLs, tokens or raw Telegram payloads in error logs.
   const message=e instanceof GrammyError?`Telegram ${e.error_code}: ${e.description}`:e.message.replace(/\b\d{5,}:[A-Za-z0-9_-]+/g,'[redacted]').slice(0,250);
   const retry=e instanceof GrammyError&&e.error_code===429?e.parameters.retry_after??60:Math.min(3600,2**job.attempts*10);
   if(e instanceof GrammyError&&e.error_code===403&&job.payload.userId)await db.user.update({where:{id:job.payload.userId},data:{blocked:true}});
   await db.job.updateMany({where:{id:job.id,lockedAt:job.lockedAt},data:{status:job.attempts>=8?'failed':'pending',runAt:new Date(Date.now()+retry*1000),lastError:message}});failed++;
  }
 }
 return {done,failed};
}
