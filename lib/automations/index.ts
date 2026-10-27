import type { User, Prisma } from '@prisma/client';
import { db, transaction, enqueue, type Tx } from '@/lib/db';
export const segments=['new','free','no_purchase','buyers','community','expiring','event'] as const;
export function segmentWhere(segment:string,eventId?:string|null):Prisma.UserWhereInput {
 const active={revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]};
 switch(segment){
  case 'new':return {createdAt:{gte:new Date(Date.now()-7*86400000)}};
  case 'free':return {freeReceived:true};
  case 'no_purchase':return {orders:{none:{status:'paid'}}};
  case 'buyers':return {orders:{some:{status:'paid',kind:'MEDITATION'}}};
  case 'community':return {entitlements:{some:{...active,product:{kind:'COMMUNITY'}}}};
  case 'expiring':return {entitlements:{some:{revokedAt:null,expiresAt:{gt:new Date(),lte:new Date(Date.now()+3*86400000)}}}};
  case 'event':return {registrations:{some:{eventId:eventId??'__missing__',status:'confirmed'}}};
  default:throw new Error('Unknown segment');
 }
}
export async function scheduleMaintenance() {
 await transaction(async tx=>{
  const expired=await tx.entitlement.findMany({where:{revokedAt:null,expiresAt:{lte:new Date()},product:{kind:'COMMUNITY'}}});
  for(const a of expired){
   await tx.entitlement.update({where:{id:a.id},data:{revokedAt:new Date()}});
   await enqueue(tx,`expire:${a.id}:${a.expiresAt!.toISOString()}`,'expire',{userId:a.userId});
  }
  const expiring=await tx.entitlement.findMany({where:{revokedAt:null,expiresAt:{gt:new Date(),lte:new Date(Date.now()+3*86400000)}}});
  for(const a of expiring)await enqueue(tx,`expiry-reminder:${a.id}:${a.expiresAt!.toISOString()}`,'expiry_reminder',{userId:a.userId,entitlementId:a.id,expiresAt:a.expiresAt!.toISOString()});
  const events=await tx.event.findMany({where:{published:true,startsAt:{gt:new Date(),lte:new Date(Date.now()+86400000)}},include:{registrations:{where:{status:'confirmed'}}}});
  for(const e of events)for(const r of e.registrations)await enqueue(tx,`event-reminder:${r.id}:${e.startsAt.toISOString()}`,'event_reminder',{userId:r.userId,eventId:e.id});
  const broadcasts=await tx.broadcast.findMany({where:{status:'scheduled',scheduledAt:{lte:new Date()}},take:10});
  for(const b of broadcasts)await enqueue(tx,`broadcast:${b.id}`,'broadcast_page',{broadcastId:b.id,cursor:null});
 });
}
export async function broadcastPage(broadcastId:string,cursor:string|null) {
 await transaction(async tx=>{
  const b=await tx.broadcast.findUniqueOrThrow({where:{id:broadcastId}});if(b.status==='cancelled')return;
  const users=await tx.user.findMany({where:{marketingConsent:true,blocked:false,...segmentWhere(b.segment,b.eventId)},orderBy:{id:'asc'},take:100,...(cursor?{skip:1,cursor:{id:cursor}}:{})});
  for(const u of users)await enqueue(tx,`broadcast:${b.id}:${u.id}`,'broadcast_message',{broadcastId:b.id,userId:u.id});
  if(users.length===100)await enqueue(tx,`broadcast-page:${b.id}:${users.at(-1)!.id}`,'broadcast_page',{broadcastId:b.id,cursor:users.at(-1)!.id});
  else await tx.broadcast.update({where:{id:b.id},data:{status:'queued'}});
 });
}
