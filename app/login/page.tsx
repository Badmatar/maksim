import Link from 'next/link';
import { LegacyTelegramLogin } from './widget';
import { BotLogin } from './bot-login';
export const dynamic = 'force-dynamic';
export default function Login() {
  const name = process.env.NEXT_PUBLIC_BOT_USERNAME;
  return <main className="login-card">
    <Link className="wordmark" href="/">MAKSIM <span>CONTROL CENTER</span></Link>
    <p className="eyebrow">ДЛЯ КОМАНДЫ</p><h1>Добро пожаловать</h1>
    <p>Подтвердите вход в нашем Telegram-боте. Доступ разрешён только владельцу и приглашённым администраторам.</p>
    {name ? <>
      <BotLogin />
      <LegacyTelegramLogin username={name} url={`${process.env.APP_URL}/api/auth/telegram`} />
    </> : <p className="notice">Вход пока не настроен. Задайте имя бота, токен и Telegram ID владельца в защищённых настройках сервера.</p>}
    <p className="muted">Сессия действует 8 часов.</p>
  </main>;
}
