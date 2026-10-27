import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
function cell(v:unknown){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;}
export async function GET(req:Request){
 try{await requireAdmin(true);}catch{return new Response(null,{status:401});}
 const kind=new URL(req.url).searchParams.get('type');if(!['users','orders'].includes(kind??''))return new Response(null,{status:400});
 const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){
  try{
   const fields=kind==='users'?['id','telegramId','name','username','source','createdAt','marketingConsent']:['id','userId','productId','amount','currency','status','createdAt'];
   controller.enqueue(encoder.encode('\uFEFF'+fields.join(',')+'\r\n'));
   let cursor:string|undefined;
   while(true){const args={orderBy:{id:'asc' as const},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})};const rows:any[]=kind==='users'?await db.user.findMany(args):await db.order.findMany(args);if(!rows.length)break;for(const row of rows)controller.enqueue(encoder.encode(fields.map(f=>cell(row[f] instanceof Date?row[f].toISOString():row[f])).join(',')+'\r\n'));cursor=rows.at(-1).id;}
   controller.close();
  }catch(e){controller.error(new Error('Export failed'));}
 }});
 return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind}.csv"`,'Cache-Control':'no-store'}});
}
