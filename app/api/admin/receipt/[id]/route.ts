import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { getBot } from '@/lib/bot';
export async function GET(_req:Request,{params}: {params:Promise<{id:string}>}){
 try{await requireAdmin();}catch{return new Response(null,{status:401});}
 const r=await db.receipt.findUnique({where:{id:(await params).id}});if(!r)return new Response(null,{status:404});
 const file=await getBot().api.getFile(r.fileId);if(!file.file_path||file.file_size&&file.file_size>10*1024*1024)return new Response(null,{status:413});
 const res=await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`,{cache:'no-store'});
 if(!res.ok)return new Response(null,{status:502});
 return new Response(res.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="receipt"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
