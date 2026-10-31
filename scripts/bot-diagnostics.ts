import 'dotenv/config';
import { Bot } from 'grammy';
import { readWebhookConfig, webhookErrorMessage } from '../lib/webhook-setup';
import { diagnoseBot } from '../lib/bot-diagnostics';
async function main() {
  const config = readWebhookConfig(process.env);
  const bot = new Bot(config.token, { client: { timeoutSeconds: 15 } });
  const report = await diagnoseBot(config, bot.api);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
main().catch(error => { console.error(webhookErrorMessage(error, process.env)); process.exitCode = 1; });
