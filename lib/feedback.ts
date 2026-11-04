import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db,transaction,enqueue,DomainError} from '@/lib/db';
export const feedbackSchema=z.object({requestId:z.uuid(),kind:z.enum(['idea','question','problem','practice']),rating:z.number().int().min(1).max(5).optional(),message:z.string().trim().min(10,'Напишите хотя бы 10 символов.').max(2000),contact:z.string().trim().max(120).default(''),context:z.string().trim().max(160).default('')}).strict();
export type FeedbackInput=z.infer<typeof feedbackSchema>;
export type FeedbackRecord={id:string;createdAt:string;kind:FeedbackInput['kind'];rating?:number;message:string;contact:string;context:string;status:'new'|'reviewed';};
export class FeedbackLimitError extends Error {constructor(message:string,public retryAfter=3600){super(message);}}
export function feedbackKey(){const secret=process.env.AUTH_SECRET;if(!secret||secret.length<32)throw new Error('FEEDBACK_NOT_CONFIGURED');return secret;}
function same(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function hmac(value:string){return createHmac('sha256',feedbackKey()).update(`feedback.${value}`).digest('base64url');}
export function feedbackBrowser(cookie:string|undefined){
 const parts=(cookie??'').split('.');
 const id=parts[0];
 // A fixed length HMAC is compared without exposing it. This token grants no
 // reading rights or user identity; it only groups anonymous write limits.
 if(id&&/^[0-9a-f-]{36}$/.test(id)&&parts.length===2&&same(hmac(id),parts[1]))return {cookie:cookie!,hash:hmac(`browser:${id}`)};
 const next=randomUUID();return {cookie:`${next}.${hmac(next)}`,hash:hmac(`browser:${next}`)};
}
export async function saveFeedback(input:FeedbackInput,browserHash:string,now=Date.now()){
 return transaction(async tx=>{
  const key=`feedback:${input.requestId}`;
  const existing=await tx.setting.findUnique({where:{key}});
  if(existing){const record=existing.value as unknown as FeedbackRecord;if(record.message!==input.message||record.contact!==input.contact||record.kind!==input.kind||record.context!==input.context||record.rating!==input.rating)throw new DomainError('Начните отправку заново.');return {id:record.id,duplicate:true};}
  const limits=[{key:`feedbackLimit:${browserHash}`,window:3600000,max:3},{key:'feedbackGlobalLimit',window:60000,max:30}];
  for(const limit of limits){
   const saved=(await tx.setting.findUnique({where:{key:limit.key}}))?.value as {until?:number;count?:number}|undefined;
   const active=typeof saved?.until==='number'&&saved.until>now;
   const count=active?Number(saved?.count??0):0;
   if(count>=limit.max)throw new FeedbackLimitError('Сообщений слишком много. Пожалуйста, попробуйте позже.',Math.max(1,Math.ceil((saved!.until!-now)/1000)));
   const value={until:active?saved!.until!:now+limit.window,count:count+1};
   await tx.setting.upsert({where:{key:limit.key},create:{key:limit.key,value},update:{value}});
  }
  await tx.setting.deleteMany({where:{key:{startsWith:'feedbackLimit:'},value:{path:['until'],lt:now}}});
  const record:FeedbackRecord={...input,id:input.requestId,createdAt:new Date(now).toISOString(),status:'new'};
  await tx.setting.create({data:{key,value:record}});
  await enqueue(tx,`feedback:${record.id}`,'feedback_notice',{id:record.id});
  return {id:record.id,duplicate:false};
 });
}
export async function listFeedback(){
 const rows=await db.$queryRaw<{value:unknown}[]>`SELECT value FROM "Setting" WHERE key LIKE 'feedback:%' ORDER BY value->>'createdAt' DESC LIMIT 100`;
 return rows.map(row=>{const record=row.value as unknown as FeedbackRecord;return {id:record.id,title:({idea:'Предложение',question:'Вопрос',problem:'Проблема',practice:'Отзыв о практике'})[record.kind],text:record.message,contact:record.contact,context:record.context,rating:record.rating,status:record.status,createdAt:record.createdAt};}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
}
