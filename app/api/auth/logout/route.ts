import { NextResponse } from 'next/server';
import { checkOrigin } from '@/lib/auth';
export async function POST(req:Request){try{checkOrigin(req);}catch{return new Response(null,{status:403});}const res=NextResponse.json({ok:true});res.cookies.delete('maksim_session');res.cookies.set('maksim_bot_login','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/auth/bot',maxAge:0});return res;}
