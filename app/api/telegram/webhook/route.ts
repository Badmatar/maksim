import { NextResponse } from 'next/server';
import { equal } from '@/lib/auth';
import { transaction, enqueue, json } from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:Request) {
 if(!process.env.WEBHOOK_SECRET||!equal(req.headers.get('x-telegram-bot-api-secret-token')??'',process.env.WEBHOOK_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(Number(req.headers.get('content-length')??0)>1048576)return new Response(null,{status:413});
 let update;try { const text=await req.text();if(text.length>1048576)return new Response(null,{status:413});update=JSON.parse(text); }catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 if(!Number.isSafeInteger(update.update_id)||update.update_id<0)return NextResponse.json({error:'Invalid update'},{status:400});
 await transaction(async tx=>{
  await tx.telegramUpdate.upsert({where:{id:BigInt(update.update_id)},create:{id:BigInt(update.update_id),payload:json(update)},update:{}});
  await enqueue(tx,`update:${update.update_id}`,'telegram_update',{updateId:update.update_id});
 });
 return NextResponse.json({ok:true});
}
