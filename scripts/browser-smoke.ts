import 'dotenv/config';
import { chromium,expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { encodeSession } from '../lib/auth';
import { db } from '../lib/db';
async function main(){
 const base=process.env.APP_URL??'http://localhost:3000';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local browser smoke only');
 const owner=process.env.OWNER_TELEGRAM_IDS?.split(',')[0];if(!owner)throw new Error('Local owner ID missing');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});let mid:string|undefined;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'maksim_session',value:encodeSession({telegramId:owner,role:'OWNER',exp:Date.now()+60000}),url:base}]);
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/admin`);await expect(page.getByRole('heading',{name:'Обзор',exact:true})).toBeVisible();await expect(page.getByText('Загрузка…')).toHaveCount(0);
  await mkdir('.local',{recursive:true});await page.screenshot({path:'.local/admin-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Медитации',exact:true}).click();await page.getByRole('button',{name:'Добавить',exact:true}).click();
  await page.getByLabel('Название',{exact:true}).fill('Browser smoke temporary record');await page.getByLabel('Описание',{exact:true}).fill('Temporary browser smoke');await page.getByLabel('Категория',{exact:true}).fill('Test');await page.getByLabel('Продолжительность, мин').fill('10');await page.getByLabel('Telegram file_id аудио').fill('browser-smoke-only');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/admin/meditations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Сохранить',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);mid=(await response.json()).data.id;await expect(page.getByRole('heading',{name:'Browser smoke temporary record'})).toBeVisible();
  await page.getByRole('button',{name:'Изменить',exact:true}).click();await page.getByLabel('Название',{exact:true}).fill('Browser smoke edited');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('heading',{name:'Browser smoke edited'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Обзор',exact:true}).click();await expect(page.getByRole('heading',{name:'Обзор',exact:true})).toBeVisible();await expect(page.getByText('Загрузка…')).toHaveCount(0);await page.screenshot({path:'.local/admin-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);console.log('Browser smoke passed: desktop/mobile, create/edit form, no client errors or mobile overflow');
 }finally{await browser.close();if(mid)await db.meditation.delete({where:{id:mid}});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
