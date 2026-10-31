import { GrammyError } from 'grammy';

type Environment = Record<string, string | undefined>;
export class WebhookSetupError extends Error {}

export function readWebhookConfig(env: Environment) {
  const required = ['BOT_TOKEN', 'WEBHOOK_SECRET', 'APP_URL'] as const;
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) {
    throw new WebhookSetupError(
      `Missing GitHub Actions secrets: ${missing.join(', ')}. Add them to Settings > Secrets and variables > Actions > Repository secrets.`
    );
  }
  for (const name of required) {
    if (env[name] !== env[name]!.trim()) {
      throw new WebhookSetupError(`${name} contains leading or trailing whitespace. Save only its value, without quotes or NAME=.`);
    }
  }
  const token = env.BOT_TOKEN!;
  const secret = env.WEBHOOK_SECRET!;
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new WebhookSetupError('BOT_TOKEN has an invalid format. Copy the token from BotFather without quotes or BOT_TOKEN=.');
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new WebhookSetupError('WEBHOOK_SECRET must contain 1-256 characters: A-Z, a-z, 0-9, underscore or hyphen. Use the same value in Vercel.');
  }
  let app: URL;
  try { app = new URL(env.APP_URL!); }
  catch { throw new WebhookSetupError('APP_URL is not a valid URL. Use the public application address, for example https://your-project.vercel.app.'); }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash || (app.pathname !== '/' && app.pathname !== '')) {
    throw new WebhookSetupError('APP_URL must be an HTTPS origin only: https://your-project.vercel.app. Do not include /admin, /api, a query or credentials.');
  }
  if (['vercel.com', 'www.vercel.com'].includes(app.hostname)) {
    throw new WebhookSetupError('APP_URL points to the Vercel dashboard. Copy the application domain from Vercel > Project > Settings > Domains.');
  }
  return { token, secret, webhookUrl: `${app.origin}/api/telegram/webhook` };
}

export function webhookErrorMessage(error: unknown, env: Environment) {
  if (error instanceof WebhookSetupError) return error.message;
  if (error instanceof GrammyError) {
    if (error.error_code === 401 || error.error_code === 404) {
      return `Telegram authentication failed (${error.error_code}). Check the GitHub BOT_TOKEN secret against BotFather; the token may be incorrect or revoked.`;
    }
    let description = error.description;
    for (const name of ['BOT_TOKEN', 'WEBHOOK_SECRET']) {
      const value = env[name];
      if (value) description = description.replaceAll(value, '[redacted]');
    }
    description = description.replace(/\b\d+:[A-Za-z0-9_-]+/g, '[redacted]');
    return `Telegram rejected webhook setup (${error.error_code}): ${description.slice(0, 400)}`;
  }
  // Network/SDK errors can embed token-bearing request URLs; never print them.
  return 'Could not complete the Telegram API request. Check runner connectivity and retry after resolving the network issue. Raw request details are hidden to protect BOT_TOKEN.';
}
