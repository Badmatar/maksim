import { z } from 'zod';
import { db, transaction, DomainError } from '@/lib/db';
const text=z.string().trim().min(1).max(3000),id=z.string().min(1),optional=z.string().nullable().optional();
const url=z.union([z.literal(''),z.url().refine(x=>x.startsWith('https://'),'Требуется HTTPS')]).nullable().optional();
const timezone=z.string().refine(v=>{try{new Intl.DateTimeFormat('ru',{timeZone:v});return true;}catch{return false;}},'Неизвестный часовой пояс');
const schemas={
 meditations:z.object({title:z.string().trim().min(1).max(160),description:text,category:text,durationMinutes:z.number().int().min(1).max(1440),audioFileId:text,coverUrl:url,free:z.boolean(),published:z.boolean()}),
 products:z.object({title:z.string().trim().min(1).max(160),description:text,kind:z.enum(['MEDITATION','COMMUNITY','EVENT']),price:z.number().int().min(1).max(100000000),currency:z.enum(['RUB','USD','EUR']),durationDays:z.number().int().min(1).max(3650).nullable().optional(),published:z.boolean(),meditationIds:z.array(id).default([])}),
 events:z.object({title:z.string().trim().min(1).max(160),description:text,format:z.enum(['Онлайн','Офлайн']),startsAt:z.iso.datetime({offset:true}).transform(x=>new Date(x)),timezone,location:text,capacity:z.number().int().min(1).max(100000),coverUrl:url,published:z.boolean(),registrationOpen:z.boolean(),productId:optional}),
 broadcasts:z.object({text,segment:z.enum(['new','free','no_purchase','buyers','community','expiring','event']),eventId:optional,scheduledAt:z.iso.datetime({offset:true}).transform(x=>new Date(x)),status:z.enum(['draft','scheduled','cancelled'])}).refine(v=>v.segment!=='event'||!!v.eventId,'Укажите событие'),
 automations:z.object({title:z.string().trim().min(1).max(160),delayDays:z.number().int().min(0).max(365),text,productId:optional,enabled:z.boolean()}),
 admins:z.object({telegramId:z.string().regex(/^\d{1,16}$/).transform(BigInt),role:z.enum(['ADMIN']),enabled:z.boolean()})
};
export const ownerResources=['settings','admins','access','registrations'];
export async function listResource(resource:string,query:string) {
 switch(resource){
  case 'dashboard': {
   const [users,pending,sales,active,free,sources,orders,failures]=await Promise.all([db.user.count(),db.order.count({where:{status:'pending_review'}}),db.order.groupBy({by:['currency'],where:{status:'paid'},_sum:{amount:true},_count:true}),db.entitlement.count({where:{revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],product:{kind:'COMMUNITY'}}}),db.user.count({where:{freeReceived:true}}),db.user.groupBy({by:['source'],_count:true}),db.order.findMany({where:{status:'pending_review'},include:{user:true,product:true,receipts:true},take:20,orderBy:{createdAt:'desc'}}),db.job.count({where:{status:'failed'}})]);
   return {users,pending,sales,active,free,sources,orders,failures};
  }
  case 'analytics': {
   const [buyers,users,repeat,byProduct,delivered]=await Promise.all([db.user.count({where:{orders:{some:{status:'paid'}}}}),db.user.count(),db.order.groupBy({by:['userId'],where:{status:'paid'},_count:true}),db.order.groupBy({by:['productId','currency'],where:{status:'paid'},_sum:{amount:true},_count:true}),db.userEvent.count({where:{type:'broadcast_sent'}})]);
   const products=await db.product.findMany({where:{id:{in:byProduct.map(p=>p.productId)}}});
   return [{id:'conversion',title:'Конверсия в покупку',description:`${buyers} покупателей из ${users} пользователей (${users?(buyers/users*100).toFixed(1):0}%)`},{id:'repeat',title:'Повторные покупатели',description:String(repeat.filter(r=>r._count>1).length)},{id:'delivered',title:'Доставленные сообщения рассылок',description:String(delivered)},...byProduct.map(p=>({id:p.productId+p.currency,title:products.find(v=>v.id===p.productId)?.title??p.productId,description:`Оплаченных заказов: ${p._count}`,amount:p._sum.amount,currency:p.currency}))];
  }
  case 'users':return db.user.findMany({where:query?{OR:[{name:{contains:query,mode:'insensitive'}},{username:{contains:query,mode:'insensitive'}},...(/^\d+$/.test(query)?[{telegramId:BigInt(query)}]:[])]}:{},include:{orders:{include:{product:true}},entitlements:{include:{product:true}},registrations:{include:{event:true}},consultations:true,events:{orderBy:{createdAt:'desc'},take:20}},take:100,orderBy:{createdAt:'desc'}});
  case 'meditations':return db.meditation.findMany({orderBy:{title:'asc'}});
  case 'products':return db.product.findMany({include:{items:true},orderBy:{title:'asc'}});
  case 'payments':return db.order.findMany({include:{user:true,product:true,receipts:true},orderBy:{createdAt:'desc'},take:100});
  case 'events':return db.event.findMany({include:{product:true,_count:{select:{registrations:true}}},orderBy:{startsAt:'desc'}});
  case 'registrations':return db.registration.findMany({include:{user:true,event:true},take:100,orderBy:{createdAt:'desc'}});
  case 'access':return db.entitlement.findMany({include:{user:true,product:true},orderBy:{expiresAt:'desc'},take:100});
  case 'broadcasts':return db.broadcast.findMany({orderBy:{scheduledAt:'desc'},take:100});
  case 'automations':return db.automationStep.findMany({orderBy:{delayDays:'asc'}});
  case 'admins':return db.admin.findMany();
  case 'settings':return db.setting.findMany({where:{key:{not:'maintenanceLease'}}});
  case 'audit':return db.auditLog.findMany({orderBy:{createdAt:'desc'},take:100});
  case 'jobs':return db.job.findMany({where:{status:{in:['failed','pending','running']}},select:{id:true,kind:true,status:true,attempts:true,lastError:true,runAt:true},orderBy:{runAt:'asc'},take:100});
  case 'consultations':return db.consultation.findMany({include:{user:true},orderBy:{createdAt:'desc'},take:100});
  default:throw new DomainError('Неизвестный раздел');
 }
}
export async function saveResource(resource:string,raw:unknown,actor:string) {
 const body=z.object({id:optional,data:z.unknown()}).parse(raw);
 return transaction(async tx=>{
  let saved:unknown;
  if(resource==='settings') {
   const s=z.object({key:z.enum(['welcome','welcomeVideo','about','menuText','privacy','menu']),value:z.unknown()}).parse(body.data);
   const value=s.key==='menu'?z.array(z.object({label:z.string().min(1).max(60),action:z.enum(['meditations','events','community','about','free','consultation','channel','access','menu']),hidden:z.boolean().optional()})).min(1).max(20).parse(s.value):text.parse(s.value);
   saved=await tx.setting.upsert({where:{key:s.key},create:{key:s.key,value},update:{value}});
  } else if(resource==='registrations') {
   const r=z.object({status:z.enum(['confirmed','waitlisted','cancelled'])}).parse(body.data);
   const reg=await tx.registration.findUniqueOrThrow({where:{id:body.id!},include:{event:true}});
   if(r.status==='confirmed'&&reg.status!=='confirmed'){
    const count=await tx.registration.count({where:{eventId:reg.eventId,status:'confirmed'}});if(count>=reg.event.capacity)throw new DomainError('Лимит мест исчерпан');
   }
   saved=await tx.registration.update({where:{id:reg.id},data:r});
  } else if(resource==='access') {
   const r=z.object({revoke:z.literal(true)}).parse(body.data);
   const a=await tx.entitlement.update({where:{id:body.id!},data:{revokedAt:new Date()}});
   const product=await tx.product.findUniqueOrThrow({where:{id:a.productId}});if(product.kind==='COMMUNITY'){const {enqueue}=await import('@/lib/db');await enqueue(tx,`revoke:${a.id}:${a.revokedAt!.toISOString()}`,'expire',{userId:a.userId});}saved=a;
  } else {
   const schema=schemas[resource as keyof typeof schemas];if(!schema)throw new DomainError('Раздел недоступен для редактирования');
   const data:any=schema.parse(body.data);
   if(resource==='products'){
    const {meditationIds,...values}=data;
    if(body.id){const old=await tx.product.findUniqueOrThrow({where:{id:body.id}});if(old.kind!==values.kind&&await tx.order.count({where:{productId:body.id}}))throw new DomainError('Нельзя менять тип продукта с заказами');}
    if(values.kind!=='MEDITATION'&&meditationIds.length)throw new DomainError('Практики доступны только продуктам типа MEDITATION');
    const p=body.id?await tx.product.update({where:{id:body.id},data:values}):await tx.product.create({data:values});
    await tx.productItem.deleteMany({where:{productId:p.id}});for(const mid of meditationIds)await tx.productItem.create({data:{productId:p.id,meditationId:mid}});saved=p;
   }else{
    if(resource==='events'&&data.productId){const p=await tx.product.findUniqueOrThrow({where:{id:data.productId}});if(p.kind!=='EVENT')throw new DomainError('Нужен продукт типа EVENT');}
    if(resource==='events'&&body.id){const count=await tx.registration.count({where:{eventId:body.id,status:'confirmed'}});if(data.capacity<count)throw new DomainError('Лимит меньше числа участников');}
    if(resource==='broadcasts'&&body.id){const b=await tx.broadcast.findUniqueOrThrow({where:{id:body.id}});if(b.status==='queued'&&data.status!=='cancelled')throw new DomainError('Рассылка уже поставлена в очередь');}
    const delegate={meditations:tx.meditation,events:tx.event,broadcasts:tx.broadcast,automations:tx.automationStep,admins:tx.admin}[resource as 'meditations'];
    saved=body.id?await (delegate as any).update({where:{id:body.id},data}):await (delegate as any).create({data});
   }
  }
  await tx.auditLog.create({data:{actor,action:`${resource}.saved`,target:body.id??'new'}});
  return saved;
 });
}
