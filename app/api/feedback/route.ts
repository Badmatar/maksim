import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {checkOrigin} from '@/lib/auth/request-origin';
import {DomainError} from '@/lib/db';
import {feedbackSchema,feedbackBrowser,saveFeedback,FeedbackLimitError} from '@/lib/feedback';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
async function readBody(req:Request){
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new Error('BAD_BODY');
 if(!req.body)throw new Error('BAD_BODY');
 const reader=req.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('BAD_BODY');}
}
export async function POST(req:Request){
 let browser:ReturnType<typeof feedbackBrowser>|undefined;
 try{
  checkOrigin(req);
  const input=feedbackSchema.parse(await readBody(req));
  browser=feedbackBrowser((await cookies()).get('maksim_feedback')?.value);
  const saved=await saveFeedback(input,browser.hash);
  const response=NextResponse.json({ok:true,id:saved.id},{status:saved.duplicate?200:201,headers});
  response.cookies.set('maksim_feedback',browser.cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/feedback',maxAge:86400});
  return response;
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const status=message==='FORBIDDEN_ORIGIN'?403:message==='BODY_TOO_LARGE'?413:error instanceof FeedbackLimitError?429:error instanceof DomainError?409:error instanceof ZodError||message==='BAD_BODY'?400:503;
  const text=status===403?'Откройте форму на сайте приложения.':status===429?(error as Error).message:status===400?'Проверьте сообщение и контакт: текст от 10 до 2000 символов.':status===413?'Сообщение слишком большое.':status===409?'Повторите отправку с новой формы.':'Не удалось сохранить сообщение. Текст остаётся в форме — попробуйте позже.';
  const response=NextResponse.json({error:text},{status,headers:{...headers,...(status===429?{'Retry-After':String((error as FeedbackLimitError).retryAfter)}:{})}});
  if(browser)response.cookies.set('maksim_feedback',browser.cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/feedback',maxAge:86400});
  return response;
 }
}
