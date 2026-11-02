'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
type Pending = { botUrl: string; expiresAt: number };
export function BotLogin() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function begin() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/bot', { method: 'POST', cache: 'no-store', headers: { 'X-Maksim-Client-Origin': window.location.origin } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось начать вход.');
      setPending(data);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!pending) return;
    let stopped = false, running = false;
    async function poll() {
      if (running || stopped) return;
      if (Date.now() >= pending!.expiresAt) { setPending(null); setError('Ссылка истекла. Начните вход заново.'); return; }
      running = true;
      try {
        const response = await fetch('/api/auth/bot', { cache: 'no-store' });
        const data = await response.json();
        if (stopped) return;
        if (response.ok && data.status === 'approved') { window.location.assign('/admin'); return; }
        if (response.status === 410) { setPending(null); setError('Ссылка истекла или уже использована. Начните вход заново.'); return; }
        if (!response.ok) { setError(data.error ?? 'Не удалось проверить вход.'); if (response.status === 403) setPending(null); }
        else setError('');
      } catch { if (!stopped) setError('Проверяем соединение с сайтом. Оставьте эту страницу открытой.'); }
      finally { running = false; }
    }
    void poll();
    const timer = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [pending]);
  return <section className="bot-login">
    {!pending ? <Button disabled={busy} onClick={begin}>{busy ? 'Готовим вход…' : 'Войти через бота'}</Button> : <>
      <a className="button primary" href={pending.botUrl} target="_blank" rel="noopener noreferrer">Открыть бота и подтвердить вход ↗</a>
      <ol className="login-steps"><li>Откройте бота по кнопке выше и нажмите «Запустить».</li><li>В боте нажмите «Подтвердить вход».</li><li>Вернитесь сюда — панель откроется автоматически.</li></ol>
      <p className="muted" role="status">Ожидаем подтверждение. Ссылка действует 5 минут. При минутном расписании ответ бота может занять до минуты.</p>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
