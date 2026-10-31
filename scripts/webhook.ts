import 'dotenv/config';
import { Bot } from 'grammy';
import { readWebhookConfig, webhookErrorMessage } from '../lib/webhook-setup';

async function main() {
  const { token, secret, webhookUrl } = readWebhookConfig(process.env);
  const bot = new Bot(token, { client: { timeoutSeconds: 20 } });
  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'chat_join_request'],
    drop_pending_updates: false,
  });
  const status = await bot.api.getWebhookInfo();
  if (status.url !== webhookUrl) {
    console.error('Telegram returned a different webhook URL. Setup was not confirmed.');
    process.exitCode = 1;
    return;
  }
  console.log({ configured: true, pending: status.pending_update_count });
  console.log('Webhook registered. Test /start and verify Vercel cron; registration alone does not confirm delivery.');
}

main().catch(error => {
  console.error(webhookErrorMessage(error, process.env));
  process.exitCode = 1;
});
