import { db, transaction, enqueue, DomainError } from '@/lib/db';
export async function createOrder(userId:string,productId:string) {
 return transaction(async tx=>{
  const p=await tx.product.findUnique({where:{id:productId},include:{event:true}});
  if(!p?.published||p.price<=0)throw new DomainError('Продукт недоступен');
  if(p.kind==='EVENT'&&(!p.event?.published||!p.event.registrationOpen||p.event.startsAt<=new Date()))throw new DomainError('Регистрация закрыта');
  const active=await tx.entitlement.findUnique({where:{userId_productId:{userId,productId}}});
  if(p.kind!=='COMMUNITY'&&active&&!active.revokedAt&&(!active.expiresAt||active.expiresAt>new Date()))throw new DomainError('У вас уже есть доступ');
  const old=await tx.order.findFirst({where:{userId,productId,status:{in:['pending_payment','pending_review','rejected']}}});
  if(old) {await tx.user.update({where:{id:userId},data:{activeOrderId:old.id}});return old;}
  const order=await tx.order.create({data:{userId,productId,amount:p.price,currency:p.currency,kind:p.kind,durationDays:p.durationDays,eventId:p.event?.id}});
  await tx.user.update({where:{id:userId},data:{activeOrderId:order.id}});
  await tx.userEvent.create({data:{userId,type:'order_created',target:order.id}});
  return order;
 });
}
export async function submitReceipt(userId:string,orderId:string,fileId:string,fileUniqueId:string,mediaType:string) {
 return transaction(async tx=>{
  const o=await tx.order.findUnique({where:{id:orderId}});
  if(!o||o.userId!==userId||!['pending_payment','rejected'].includes(o.status))throw new DomainError('Выберите заказ, ожидающий оплаты');
  const duplicate=await tx.receipt.findUnique({where:{fileUniqueId}});
  if(duplicate)throw new DomainError('Эта квитанция уже загружена. Обратитесь к администратору для проверки.');
  await tx.receipt.create({data:{orderId,fileId,fileUniqueId,mediaType}});
  await tx.order.update({where:{id:orderId},data:{status:'pending_review',rejectionReason:null}});
  await tx.user.update({where:{id:userId},data:{activeOrderId:null}});
  await enqueue(tx,`receipt:${orderId}:${fileUniqueId}`,'receipt_notice',{orderId,fileId,mediaType});
 });
}
export async function approveOrder(orderId:string,actor:string) {
 return transaction(async tx=>{
  const o=await tx.order.findUnique({where:{id:orderId},include:{product:true}});
  if(!o)throw new DomainError('Заказ не найден');
  if(o.status==='paid')return o;
  if(o.status!=='pending_review')throw new DomainError('Нет квитанции для проверки');
  if(o.eventId) {
   const event=await tx.event.findUniqueOrThrow({where:{id:o.eventId}});
   if(event.startsAt<=new Date())throw new DomainError('Событие уже началось. Требуется возврат.');
   const existing=await tx.registration.findUnique({where:{userId_eventId:{userId:o.userId,eventId:event.id}}});
   const count=await tx.registration.count({where:{eventId:event.id,status:'confirmed'}});
   if(existing?.status!=='confirmed'&&count>=event.capacity)throw new DomainError('Нет свободных мест. Организуйте возврат или измените лимит.');
   await tx.registration.upsert({where:{userId_eventId:{userId:o.userId,eventId:event.id}},create:{userId:o.userId,eventId:event.id,status:'confirmed'},update:{status:'confirmed'}});
  }
  const old=await tx.entitlement.findUnique({where:{userId_productId:{userId:o.userId,productId:o.productId}}});
  const now=new Date();
  const relevant=o.kind==='COMMUNITY'?await tx.entitlement.findMany({where:{userId:o.userId,revokedAt:null,product:{kind:'COMMUNITY'},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}):old&&!old.revokedAt?[old]:[];
  const perpetual=relevant.some(a=>!a.expiresAt);
  const base=new Date(Math.max(now.getTime(),...relevant.map(a=>a.expiresAt?.getTime()??0)));
  const expiresAt=perpetual||!o.durationDays?null:new Date(base.getTime()+o.durationDays*86400000);
  await tx.entitlement.upsert({where:{userId_productId:{userId:o.userId,productId:o.productId}},create:{userId:o.userId,productId:o.productId,expiresAt},update:{expiresAt,revokedAt:null}});
  const paid=await tx.order.update({where:{id:orderId},data:{status:'paid',paidAt:now,rejectionReason:null}});
  await tx.auditLog.create({data:{actor,action:'payment.approved',target:orderId}});
  await tx.userEvent.create({data:{userId:o.userId,type:'purchase',target:o.productId}});
  await enqueue(tx,`paid:${orderId}`,'paid',{orderId});
  return paid;
 });
}
export async function rejectOrder(orderId:string,actor:string,reason:string) {
 if(reason.trim().length<3)throw new DomainError('Укажите причину отклонения');
 return transaction(async tx=>{
  const o=await tx.order.findUniqueOrThrow({where:{id:orderId}});
  if(o.status!=='pending_review')throw new DomainError('Заказ уже рассмотрен');
  await tx.order.update({where:{id:orderId},data:{status:'rejected',rejectionReason:reason}});
  await tx.user.update({where:{id:o.userId},data:{activeOrderId:orderId}});
  await tx.auditLog.create({data:{actor,action:'payment.rejected',target:orderId}});
  await enqueue(tx,`rejected:${orderId}:${await tx.receipt.count({where:{orderId}})}`,'message',{userId:o.userId,text:`Оплата заказа ${orderId} отклонена: ${reason}. Выберите заказ в «Мой доступ» и отправьте новую квитанцию.`});
 });
}
export async function refundOrder(orderId:string,actor:string,reason:string) {
 return transaction(async tx=>{
  const o=await tx.order.findUniqueOrThrow({where:{id:orderId}});
  if(o.status!=='paid')throw new DomainError('Заказ не оплачен');
  await tx.order.update({where:{id:orderId},data:{status:'refunded',rejectionReason:reason}});
  // Refund is an administrative record after a real bank transfer; revoke this product explicitly.
  await tx.entitlement.updateMany({where:{userId:o.userId,productId:o.productId},data:{revokedAt:new Date()}});
  if(o.eventId)await tx.registration.updateMany({where:{userId:o.userId,eventId:o.eventId},data:{status:'cancelled'}});
  if(o.kind==='COMMUNITY')await enqueue(tx,`refund-revoke:${orderId}`,'expire',{userId:o.userId});
  await tx.auditLog.create({data:{actor,action:'payment.refunded',target:orderId}});
  await enqueue(tx,`refund:${orderId}`,'message',{userId:o.userId,text:`Возврат заказа ${orderId} отмечен администратором. ${reason}`});
 });
}
export async function hasMeditation(userId:string,meditationId:string) {
 const m=await db.meditation.findUnique({where:{id:meditationId}});
 if(!m?.published)return false;
 return m.free||!!await db.entitlement.findFirst({where:{userId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],product:{items:{some:{meditationId}}}}});
}
