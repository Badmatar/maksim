import { requireAdmin,checkOrigin } from '@/lib/auth';
import { listResource,saveResource,ownerResources } from '@/lib/admin';
import { json,DomainError } from '@/lib/db';
import { approveOrder,rejectOrder,refundOrder } from '@/lib/payments';
import { z,ZodError } from 'zod';
type Context={params:Promise<{resource:string}>};
function failure(e:unknown){const msg=e instanceof Error?e.message:'';const status=msg==='UNAUTHORIZED'?401:msg==='FORBIDDEN_ORIGIN'?403:e instanceof DomainError||e instanceof ZodError?400:500;return Response.json({error:status===500?'Не удалось выполнить операцию':msg},{status});}
export async function GET(req:Request,c:Context){try{const {resource}=await c.params;await requireAdmin(ownerResources.includes(resource));return Response.json(json(await listResource(resource,new URL(req.url).searchParams.get('q')??'')));}catch(e){return failure(e);}}
export async function POST(req:Request,c:Context){try{
 checkOrigin(req);const {resource}=await c.params;const actor=await requireAdmin(ownerResources.includes(resource));
 if(Number(req.headers.get('content-length')??0)>65536)return new Response(null,{status:413});
 const body=await req.json();let result;
 if(resource==='payments'){
  const p=z.object({id:z.string(),action:z.enum(['approve','reject','refund']),reason:z.string().trim().min(3).max(1000).optional()}).parse(body);
  if(p.action==='approve')result=await approveOrder(p.id,actor.telegramId);
  else if(p.action==='reject')result=await rejectOrder(p.id,actor.telegramId,p.reason??'');
  else{await requireAdmin(true);if(!p.reason)throw new DomainError('Укажите причину');result=await refundOrder(p.id,actor.telegramId,p.reason);}
 }else result=await saveResource(resource,body,actor.telegramId);
 return Response.json({ok:true,data:json(result)});
 }catch(e){return failure(e);}}
