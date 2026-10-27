import { Bot, InlineKeyboard, Keyboard, type Context } from 'grammy';
import { db, DomainError, transaction, enqueue } from '@/lib/db';
import { defaultMenu, menu, setting, money } from '@/lib/content';
import { createOrder, submitReceipt, approveOrder, rejectOrder, hasMeditation } from '@/lib/payments';
import { registerFree } from '@/lib/events';
import { roleFor } from '@/lib/auth';
let singleton:Bot|undefined;
export function getBot() {
 if(singleton)return singleton;
 if(!process.env.BOT_TOKEN)throw new Error('BOT_TOKEN is not configured');
 const bot=new Bot(process.env.BOT_TOKEN,{client:{timeoutSeconds:10}});
 bot.use(async(ctx,next)=>{try{await next();}catch(e){if(e instanceof DomainError){await ctx.reply(e.message);return;}throw e;}});
 bot.use(async(ctx,next)=>{
  if(!ctx.chatJoinRequest && ctx.chat?.type!=='private')return;
  if(ctx.from) {
   await db.user.upsert({where:{telegramId:BigInt(ctx.from!.id)},create:{telegramId:BigInt(ctx.from!.id),name:ctx.from.first_name,username:ctx.from.username},update:{name:ctx.from.first_name,username:ctx.from.username,lastSeenAt:new Date(),blocked:false}});
  }
  await next();
 });
 async function user(id:number){return db.user.findUniqueOrThrow({where:{telegramId:BigInt(id)}});}
 async function showMenu(ctx:Context) {
  const entries=(await menu()).filter(x=>!x.hidden);
  const keyboard=new Keyboard();entries.forEach((x,i)=>{keyboard.text(x.label);if(i%2===1)keyboard.row();});
  await ctx.reply(await setting('menuText','Максим Машков | Пространство практик\n\nВыбери, с чего хочешь начать.'),{reply_markup:keyboard.resized()});
 }
 bot.command('start',async ctx=>{
  const u=await user(ctx.from!.id);
  if(u.onboarded){await showMenu(ctx);return;}
  await db.user.update({where:{id:u.id},data:{source:u.source??(ctx.match||'direct').slice(0,64)}});
  await ctx.reply(await setting('welcome','Добро пожаловать в пространство практик Максима Машкова. Здесь можно остановиться, услышать себя и вернуться к настоящему.'));
  const video=await setting('welcomeVideo');if(video)await ctx.replyWithVideo(video);
  await ctx.reply('Начнём с бесплатной практики?',{reply_markup:new InlineKeyboard().text('🌿 Получить практику','free')});
 });
 bot.command('unsubscribe',async ctx=>{await db.user.update({where:{telegramId:BigInt(ctx.from!.id)},data:{marketingConsent:false}});await ctx.reply('Вы отписались от маркетинговых сообщений. Уведомления по заказам и событиям сохранятся.');});
 bot.command('subscribe',async ctx=>{await ctx.reply('Разрешаете присылать новости и предложения? Отказ: /unsubscribe. Политика обработки данных доступна по команде /privacy.',{reply_markup:new InlineKeyboard().text('Да, подписаться','consent')});});
 bot.command('privacy',async ctx=>{await ctx.reply(await setting('privacy','Сохраняем Telegram ID, имя, заявки и покупки для работы сервиса. Не отправляйте сведения о здоровье. Для удаления данных обратитесь к администратору через раздел «Консультация».'));});
 bot.callbackQuery('consent',async ctx=>{
  const u=await user(ctx.from!.id);
  await transaction(async tx=>{
   await tx.user.update({where:{id:u.id},data:{marketingConsent:true}});
   await tx.userEvent.create({data:{userId:u.id,type:'marketing_consent'}});
   const steps=await tx.automationStep.findMany({where:{enabled:true}});
   for(const s of steps)await enqueue(tx,`automation:${u.id}:${s.id}`,'automation',{userId:u.id,stepId:s.id},new Date(Date.now()+s.delayDays*86400000));
  });await ctx.answerCallbackQuery('Подписка оформлена');
 });
 async function action(ctx:any,name:string) {
  const u=await user(ctx.from!.id);
  if(name==='free') {
   const m=await db.meditation.findFirst({where:{free:true,published:true}});
   if(!m){await ctx.reply('Бесплатная практика скоро появится.');return;}
   await ctx.replyWithAudio(m.audioFileId,{caption:m.title});
   await db.user.update({where:{id:u.id},data:{freeReceived:true,onboarded:true}});
   await showMenu(ctx);return;
  }
  if(name==='meditations') {
   const list=await db.meditation.findMany({where:{published:true}});
   if(!list.length)await ctx.reply('Практики скоро появятся.');
   for(const m of list){if(m.coverUrl)await ctx.replyWithPhoto(m.coverUrl);await ctx.reply(`${m.title} · ${m.durationMinutes} мин\n${m.category}\n${m.description}`,{reply_markup:new InlineKeyboard().text(m.free?'Слушать бесплатно':'Открыть',`med:${m.id}`)});}
  } else if(name==='events') {
   const events=await db.event.findMany({where:{published:true,startsAt:{gt:new Date()}},include:{product:true},orderBy:{startsAt:'asc'}});
   if(!events.length)await ctx.reply('Новые встречи скоро появятся.');
   for(const e of events){if(e.coverUrl)await ctx.replyWithPhoto(e.coverUrl);await ctx.reply(`${e.title}\n${e.description}\n${e.startsAt.toLocaleString('ru-RU',{timeZone:e.timezone})} (${e.timezone})\n${e.format}\n${e.product?money(e.product.price,e.product.currency):'Бесплатно'}`,{reply_markup:new InlineKeyboard().text('Записаться',`event:${e.id}`)});}
  } else if(name==='community') {
   const ps=await db.product.findMany({where:{kind:'COMMUNITY',published:true}});
   if(!ps.length)await ctx.reply('Набор в сообщество скоро откроется.');
   for(const p of ps)await ctx.reply(`${p.title}\n${p.description}\n${money(p.price,p.currency)} · ${p.durationDays?`${p.durationDays} дней`:'Бессрочно'}`,{reply_markup:new InlineKeyboard().text('Оформить доступ',`buy:${p.id}`)});
  } else if(name==='about')await ctx.reply(await setting('about','Максим Машков — психолог, психотерапевт и тренер личностного роста.'));
  else if(name==='channel') {const url=process.env.PUBLIC_CHANNEL_URL;await ctx.reply(url?`Открытый канал: ${url}`:'Ссылка на канал скоро появится.');}
  else if(name==='consultation') {await db.user.update({where:{id:u.id},data:{awaitingConsultation:true}});await ctx.reply('Отправьте краткий запрос. Контактные данные — по желанию. Не указывайте диагнозы и медицинские сведения. /cancel — отмена.');}
  else if(name==='access') {
   const access=await db.entitlement.findMany({where:{userId:u.id,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},include:{product:true}});
   await ctx.reply(access.length?access.map(a=>`${a.product.title}: ${a.expiresAt?a.expiresAt.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}):'бессрочно'}`).join('\n'):'Активных доступов пока нет.');
   if(access.some(a=>a.product.kind==='COMMUNITY'))await ctx.reply('Вход в сообщество',{reply_markup:new InlineKeyboard().text('Получить приглашение','invite')});
   const orders=await db.order.findMany({where:{userId:u.id,status:{in:['pending_payment','rejected','pending_review']}},include:{product:true}});
   for(const o of orders)await ctx.reply(`${o.product.title}: ${o.status}\nЗаказ ${o.id}`,{reply_markup:o.status!=='pending_review'?new InlineKeyboard().text('Отправить квитанцию',`receipt:${o.id}`):undefined});
  } else if(name==='menu')await showMenu(ctx);
 }
 bot.command('cancel',async ctx=>{await db.user.update({where:{telegramId:BigInt(ctx.from!.id)},data:{awaitingConsultation:false,activeOrderId:null}});await showMenu(ctx);});
 bot.on('callback_query:data',async ctx=>{
  await ctx.answerCallbackQuery();
  const [type,id]=ctx.callbackQuery.data.split(':');const u=await user(ctx.from!.id);
  if(type==='approve'||type==='reject') {
   if(!await roleFor(String(ctx.from!.id)))throw new DomainError('Недостаточно прав');
   if(type==='approve')await approveOrder(id,String(ctx.from!.id));else await rejectOrder(id,String(ctx.from!.id),'Поступление не подтверждено. Уточните данные у администратора.');
   await ctx.reply(type==='approve'?'Оплата подтверждена':'Оплата отклонена');return;
  }
  if(type==='buy') {
   if(!process.env.PAYMENT_DETAILS)throw new DomainError('Приём оплаты пока не настроен');
   const o=await createOrder(u.id,id);
   await ctx.reply(`Заказ ${o.id}\nК оплате: ${money(o.amount,o.currency)}\n${process.env.PAYMENT_DETAILS}\n\nПосле перевода отправьте фото или документ квитанции. Проверка по банковской выписке выполняется вручную.`);return;
  }
  if(type==='receipt') {
   const o=await db.order.findUnique({where:{id}});if(!o||o.userId!==u.id||!['pending_payment','rejected'].includes(o.status))throw new DomainError('Заказ недоступен');
   await db.user.update({where:{id:u.id},data:{activeOrderId:id}});await ctx.reply(`Отправьте квитанцию для заказа ${id}.`);return;
  }
  if(type==='med') {
   if(await hasMeditation(u.id,id)) {const m=await db.meditation.findUniqueOrThrow({where:{id}});await ctx.replyWithAudio(m.audioFileId,{caption:m.title});}
   else {
    const products=await db.product.findMany({where:{published:true,items:{some:{meditationId:id}}}});
    if(!products.length)await ctx.reply('Практика пока недоступна для покупки.');
    for(const p of products)await ctx.reply(`${p.title}\n${p.description}\n${money(p.price,p.currency)}`,{reply_markup:new InlineKeyboard().text('Купить',`buy:${p.id}`)});
   }
   await db.userEvent.create({data:{userId:u.id,type:'meditation_view',target:id}});return;
  }
  if(type==='event') {
   const e=await db.event.findUnique({where:{id},include:{product:true}});if(!e?.published)throw new DomainError('Событие недоступно');
   if(e.product&&e.product.price>0)await ctx.reply('Для регистрации оплатите участие. Место подтверждается после проверки оплаты.',{reply_markup:new InlineKeyboard().text('Оплатить',`buy:${e.product.id}`)});
   else {const r=await registerFree(u.id,id);await ctx.reply(r.status==='confirmed'?'Регистрация подтверждена':'Вы в списке ожидания');}return;
  }
  if(type==='invite') {await transaction(tx=>enqueue(tx,`invite:${u.id}:${Math.floor(Date.now()/600000)}`,'invite',{userId:u.id}));await ctx.reply('Приглашение будет отправлено отдельным сообщением.');return;}
  await action(ctx,type);
 });
 bot.on('message:audio',async ctx=>{
  if(!await roleFor(String(ctx.from!.id)))return;
  await ctx.reply(`Telegram file_id аудио:\n${ctx.message.audio.file_id}`);
 });
 bot.on('message:photo',async ctx=>{
  const u=await user(ctx.from!.id);const f=ctx.message.photo.at(-1)!;
  if(!u.activeOrderId)throw new DomainError('Сначала выберите заказ в «Мой доступ»');
  await submitReceipt(u.id,u.activeOrderId,f.file_id,f.file_unique_id,'photo');await ctx.reply('Квитанция передана на проверку.');
 });
 bot.on('message:document',async ctx=>{
  const u=await user(ctx.from!.id),f=ctx.message.document;
  if(!u.activeOrderId)throw new DomainError('Сначала выберите заказ в «Мой доступ»');
  if((f.file_size??0)>10*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(f.mime_type??''))throw new DomainError('Нужны PDF, JPG или PNG до 10 МБ');
  await submitReceipt(u.id,u.activeOrderId,f.file_id,f.file_unique_id,'document');await ctx.reply('Квитанция передана на проверку.');
 });
 bot.on('chat_join_request',async ctx=>{
  const request=ctx.chatJoinRequest;
  if(String(request.chat.id)!==process.env.COMMUNITY_CHAT_ID)return;
  const invite=await db.invite.findUnique({where:{link:request.invite_link?.invite_link??''},include:{user:true}});
  const active=invite&&!invite.usedAt&&invite.expiresAt>new Date()&&invite.user.telegramId===BigInt(request.from.id)&&await db.entitlement.findFirst({where:{userId:invite.userId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],product:{kind:'COMMUNITY'}}});
  if(active) {await ctx.api.approveChatJoinRequest(request.chat.id,request.from.id);await db.invite.update({where:{id:invite!.id},data:{usedAt:new Date()}});await ctx.api.revokeChatInviteLink(request.chat.id,invite!.link);}
  else await ctx.api.declineChatJoinRequest(request.chat.id,request.from.id);
 });
 bot.on('message:text',async ctx=>{
  const u=await user(ctx.from!.id);
  const entry=(await menu()).find(x=>!x.hidden&&x.label===ctx.message.text);
  if(entry){await action(ctx,entry.action);return;}
  if(u.awaitingConsultation) {
   await transaction(async tx=>{
    const c=await tx.consultation.create({data:{userId:u.id,text:ctx.message.text.slice(0,2000)}});
    await tx.user.update({where:{id:u.id},data:{awaitingConsultation:false}});
    await enqueue(tx,`consultation:${c.id}`,'consultation',{id:c.id});
   });await ctx.reply('Заявка сохранена. Максим свяжется с вами в Telegram.');return;
  }
  await showMenu(ctx);
 });
 // Expected business errors should reach the user; infrastructure failures must retry the durable job.

 singleton=bot;return bot;
}
