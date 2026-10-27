import { NextResponse } from 'next/server';
import { encodeSession, roleFor, verifyTelegram } from '@/lib/auth';
export async function GET(req:Request) {
 const url=new URL(req.url),data=Object.fromEntries(url.searchParams);
 if(!process.env.BOT_TOKEN||!verifyTelegram(data,process.env.BOT_TOKEN))return NextResponse.json({error:'Ссылка входа недействительна или истекла'},{status:401});
 const role=await roleFor(data.id);if(!role)return NextResponse.json({error:'Доступ разрешён только администраторам'},{status:403});
 const response=NextResponse.redirect(new URL('/admin',process.env.APP_URL??req.url));
 response.cookies.set('maksim_session',encodeSession({telegramId:data.id,role,exp:Date.now()+8*3600000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*3600,path:'/'});
 return response;
}
