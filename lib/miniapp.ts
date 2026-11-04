const actions = ['free', 'meditations', 'events', 'community', 'about', 'consultation', 'access', 'channel'] as const;
export type MiniappAction = typeof actions[number];
export function miniappUrl() {
  try {
    const url = new URL(process.env.APP_URL ?? '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return new URL('/miniapp', url).href;
  } catch { return null; }
}
export function miniappAction(payload: string): MiniappAction | null {
  if (!payload.startsWith('open_')) return null;
  const action = payload.slice(5);
  return actions.includes(action as MiniappAction) ? action as MiniappAction : null;
}
export function botActionUrl(username: string | undefined, action: MiniappAction) {
  return username && /^[A-Za-z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}?start=open_${action}` : null;
}
