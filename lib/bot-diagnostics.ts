export type DiagnosticConfig = { webhookUrl: string; secret: string };
export type ReadOnlyBotApi = {
  getMe(): Promise<{ username?: string }>;
  getWebhookInfo(): Promise<{ url?: string; pending_update_count: number; last_error_message?: string }>;
};

export async function diagnoseBot(config: DiagnosticConfig, api: ReadOnlyBotApi, fetcher: typeof fetch = fetch) {
  const origin = new URL(config.webhookUrl).origin;
  const options = { redirect: 'manual' as const, signal: AbortSignal.timeout(15_000) };
  const [identity, webhook, healthResponse, runtimeResponse] = await Promise.all([
    api.getMe(), api.getWebhookInfo(),
    fetcher(`${origin}/api/health`, options),
    fetcher(`${origin}/api/telegram/diagnostics`, { ...options, headers: { 'x-telegram-bot-api-secret-token': config.secret } }),
  ]);
  const health = await healthResponse.json().catch(() => ({}));
  const runtime = await runtimeResponse.json().catch(() => ({}));
  const issues: string[] = [];
  const warnings: string[] = [];
  if (healthResponse.status !== 200 || health.status !== 'ok') issues.push('App health failed: check latest Vercel deployment, database settings and runtime logs.');
  if (runtimeResponse.status === 401) issues.push('WEBHOOK_SECRET differs between GitHub and Vercel, or is missing in Vercel.');
  else if (runtimeResponse.status === 404) issues.push('Diagnostic route is not deployed yet. Wait for the newest Vercel deployment.');
  else if (runtimeResponse.status !== 200) issues.push(`Runtime diagnostics failed with HTTP ${runtimeResponse.status}. Check deployment protection and Vercel logs.`);
  if (webhook.url !== config.webhookUrl) issues.push('Telegram webhook points to another address or is not configured. Run operation webhook with the production APP_URL.');
  const configured = runtime.configured as Record<string, boolean> | undefined;
  if (configured) for (const name of ['BOT_TOKEN', 'WEBHOOK_SECRET', 'CRON_SECRET', 'DATABASE_URL']) {
    if (!configured[name]) issues.push(`${name} is missing in Vercel Production. Add it and redeploy.`);
  }
  if (runtimeResponse.status === 200) {
    if (!runtime.botUsername) issues.push('NEXT_PUBLIC_BOT_USERNAME is missing or invalid in Vercel.');
    else if (runtime.botUsername.toLowerCase() !== identity.username?.toLowerCase()) issues.push('GitHub BOT_TOKEN belongs to a different bot than NEXT_PUBLIC_BOT_USERNAME in Vercel.');
    if (!runtime.scheduler?.completedAt) warnings.push('No completed scheduler run recorded. Save and enable the minute job on cron-job.org.');
    else if (Date.now() - Date.parse(runtime.scheduler.completedAt) > 180_000) warnings.push('Scheduler status is older than 3 minutes. Check cron-job.org history and Authorization header.');
    if (runtime.scheduler?.status === 'error') warnings.push('Last background scheduler run failed. Check Vercel logs.');
    if (runtime.jobs?.some((job: { status: string }) => job.status === 'failed')) warnings.push('Failed jobs exist. Inspect failureTypes and the admin queue; old failed jobs are not retried automatically.');
  }
  // Do not return Telegram API descriptions: they may contain unexpected data.
  return {
    ok: issues.length === 0,
    botUsername: identity.username ?? null,
    webhookMatchesApp: webhook.url === config.webhookUrl,
    pendingTelegramUpdates: webhook.pending_update_count,
    telegramHasDeliveryError: Boolean(webhook.last_error_message),
    healthHttpStatus: healthResponse.status,
    runtimeHttpStatus: runtimeResponse.status,
    configured: configured ?? null,
    scheduler: runtime.scheduler ?? null,
    jobs: runtime.jobs ?? null,
    failureTypes: runtime.failureTypes ?? null,
    issues, warnings,
  };
}
