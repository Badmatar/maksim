import 'dotenv/config';
import { Bot } from 'grammy';
async function main(){
 const {BOT_TOKEN,WEBHOOK_SECRET,APP_URL}=process.env;
 if(!BOT_TOKEN||!WEBHOOK_SECRET||!APP_URL?.startsWith('https://'))throw new Error('Set BOT_TOKEN, WEBHOOK_SECRET and HTTPS APP_URL');
 const bot=new Bot(BOT_TOKEN);
 await bot.api.setWebhook(`${APP_URL}/api/telegram/webhook`,{secret_token:WEBHOOK_SECRET,allowed_updates:['message','callback_query','chat_join_request'],drop_pending_updates:false});
 const status=await bot.api.getWebhookInfo();console.log({configured:status.url===`${APP_URL}/api/telegram/webhook`,pending:status.pending_update_count});
}
main().catch(()=>{console.error('Webhook setup failed. Check configuration and bot access.');process.exitCode=1;});
