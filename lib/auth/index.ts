import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
export type Principal = { telegramId: string; role: 'OWNER'|'ADMIN'; exp: number };
function secret() { const s=process.env.AUTH_SECRET; if (!s || s.length<32) throw new Error('AUTH_SECRET must contain at least 32 characters'); return s; }
export function equal(a:string,b:string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export function verifyTelegram(data:Record<string,string>, token:string, now=Date.now()) {
  if (!/^\d+$/.test(data.id??'') || !/^\d+$/.test(data.auth_date??'')) return false;
  const age=now/1000-Number(data.auth_date);
  if(age< -30 || age>300) return false;
  const check=Object.keys(data).filter(k=>k!=='hash').sort().map(k=>`${k}=${data[k]}`).join('\n');
  const expected=createHmac('sha256',createHash('sha256').update(token).digest()).update(check).digest('hex');
  return equal(expected,data.hash??'');
}
export function encodeSession(p:Principal) { const value=Buffer.from(JSON.stringify(p)).toString('base64url'); return `${value}.${createHmac('sha256',secret()).update(value).digest('base64url')}`; }
export function decodeSession(raw:string):Principal|null {
  try { const [value,sig]=raw.split('.'); if(!equal(createHmac('sha256',secret()).update(value).digest('base64url'),sig??''))return null; const p=JSON.parse(Buffer.from(value,'base64url').toString()); return /^\d+$/.test(p.telegramId)&&p.exp>Date.now() ? p : null; } catch { return null; }
}
export async function roleFor(id:string):Promise<Principal['role']|null> {
  if((process.env.OWNER_TELEGRAM_IDS??'').split(',').map(s=>s.trim()).includes(id))return 'OWNER';
  const a=await db.admin.findUnique({where:{telegramId:BigInt(id)}}); return a?.enabled&&['ADMIN','OWNER'].includes(a.role)?a.role as Principal['role']:null;
}
export async function requireAdmin(owner=false) {
  const session=decodeSession((await cookies()).get('maksim_session')?.value??'');
  const role=session?await roleFor(session.telegramId):null;
  if(!session||!role||(owner&&role!=='OWNER'))throw new Error('UNAUTHORIZED');
  return {...session,role};
}
export function checkOrigin(req:Request) {
  const expected=new URL(process.env.APP_URL??req.url).origin;
  if(req.headers.get('origin')!==expected)throw new Error('FORBIDDEN_ORIGIN');
}
export function randomSecret() { return randomBytes(32).toString('hex'); }
