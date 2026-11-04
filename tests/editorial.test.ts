import { afterAll, beforeEach, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setting } from '@/lib/content';
import { defaultTexts, writtenPractices, practiceText } from '@/lib/editorial';
import { listResource, saveResource } from '@/lib/admin';
beforeEach(async()=>{await db.setting.deleteMany();});
afterAll(async()=>{await db.$disconnect();});
it('upgrades the shipped starter copy without overwriting it in the database',async()=>{
 const legacy='Добро пожаловать в пространство практик Максима Машкова. Здесь можно остановиться, услышать себя и вернуться к настоящему.';
 await db.setting.create({data:{key:'welcome',value:legacy}});
 expect(await setting('welcome')).toBe(defaultTexts.welcome);
 expect((await db.setting.findUniqueOrThrow({where:{key:'welcome'}})).value).toBe(legacy);
});
it('lets the owner edit effective defaults while keeping internal settings private',async()=>{
 await db.setting.createMany({data:[{key:'botLogin:private',value:'secret'},{key:'botLoginRate',value:1},{key:'maintenanceLease',value:'private'}]});
 await saveResource('settings',{data:{key:'communityText',value:'Авторский текст сообщества'}},'test-owner');
 expect(await setting('communityText')).toBe('Авторский текст сообщества');
 const settings=await listResource('settings','') as {key:string;value:unknown}[];
 expect(settings.find(row=>row.key==='communityText')?.value).toBe('Авторский текст сообщества');
 expect(settings.find(row=>row.key==='eventsText')?.value).toBe(defaultTexts.eventsText);
 expect(settings.some(row=>row.key.startsWith('botLogin')||row.key==='maintenanceLease')).toBe(false);
});
it('keeps original guides within Telegram limits and welcome within the photo caption limit',()=>{
 expect(defaultTexts.welcome.length).toBeLessThanOrEqual(1024);
 for(const text of [...Object.values(defaultTexts),...writtenPractices.map(practiceText)])expect(text.length).toBeLessThan(4000);
});
