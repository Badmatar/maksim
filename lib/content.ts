import { db } from '@/lib/db';
export const defaultMenu=[{label:'🧘 Медитации',action:'meditations'},{label:'🗓 Мероприятия',action:'events'},{label:'🤍 Сообщество',action:'community'},{label:'👤 О Максиме',action:'about'},{label:'🌿 Бесплатная практика',action:'free'},{label:'💬 Консультация',action:'consultation'},{label:'📢 Открытый канал',action:'channel'},{label:'✨ Мой доступ',action:'access'}];
export async function setting(key:string,fallback='') {const s=await db.setting.findUnique({where:{key}});return typeof s?.value==='string'?s.value:fallback;}
export async function menu() {const s=await db.setting.findUnique({where:{key:'menu'}});return (Array.isArray(s?.value)?s.value:defaultMenu) as {label:string;action:string;hidden?:boolean}[];}
export function money(amount:number,currency='RUB'){return new Intl.NumberFormat('ru-RU',{style:'currency',currency}).format(amount/100);}
