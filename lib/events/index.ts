import { transaction, enqueue, DomainError } from '@/lib/db';
export async function registerFree(userId:string,eventId:string) {
 return transaction(async tx=>{
  const e=await tx.event.findUnique({where:{id:eventId},include:{product:true}});
  if(!e?.published||!e.registrationOpen||e.startsAt<=new Date())throw new DomainError('Регистрация закрыта');
  if(e.product&&e.product.price>0)throw new DomainError('Для участия нужна оплата');
  const old=await tx.registration.findUnique({where:{userId_eventId:{userId,eventId}}});
  if(old&&old.status!=='cancelled')return old;
  const full=await tx.registration.count({where:{eventId,status:'confirmed'}})>=e.capacity;
  const r=await tx.registration.upsert({where:{userId_eventId:{userId,eventId}},create:{userId,eventId,status:full?'waitlisted':'confirmed'},update:{status:full?'waitlisted':'confirmed'}});
  await enqueue(tx,`registration:${r.id}:${r.createdAt.toISOString()}`,'message',{userId,text:full?`Вы в списке ожидания «${e.title}».`:`Вы записаны на «${e.title}». ${e.location}`});
  return r;
 });
}
