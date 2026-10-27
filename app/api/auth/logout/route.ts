import { NextResponse } from 'next/server';
import { checkOrigin } from '@/lib/auth';
export async function POST(req:Request){try{checkOrigin(req);}catch{return new Response(null,{status:403});}const res=NextResponse.json({ok:true});res.cookies.delete('maksim_session');return res;}
