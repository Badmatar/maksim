'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, AudioLines, CalendarDays, CircleUserRound, Home, Leaf, Play, Sparkles, UsersRound, X, ChevronLeft } from 'lucide-react';
import { botActionUrl, type MiniappAction } from '@/lib/miniapp';
import './practice-app.css';
export type Catalog = {
  meditations: { id: string; title: string; description: string; category: string; durationMinutes: number; free: boolean; coverUrl: string | null }[];
  events: { id: string; title: string; description: string; format: string; date: string; timezone: string; registrationOpen: boolean; coverUrl: string | null }[];
  communities: { id: string; title: string; description: string; price: number; currency: string; durationDays: number | null }[];
  about: string; unavailable: boolean;
};
type Tab = 'home' | 'practices' | 'events' | 'community' | 'about';
type TelegramApp = { initData: string; ready: () => void; expand: () => void; setHeaderColor: (color: string) => void; setBackgroundColor: (color: string) => void; openTelegramLink: (url: string) => void; BackButton: { show: () => void; hide: () => void; onClick: (fn: () => void) => void; offClick: (fn: () => void) => void } };
function telegram() { return (window as Window & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp; }
const tabs = [ ['home', 'Главная', Home], ['practices', 'Практики', AudioLines], ['events', 'Встречи', CalendarDays], ['community', 'Сообщество', UsersRound], ['about', 'О Максиме', CircleUserRound] ] as const;
export function PracticeApp({ catalog, username }: { catalog: Catalog; username?: string }) {
  const [tab, setTab] = useState<Tab>('home');
  const [category, setCategory] = useState('Все');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<{ title: string; description: string; action: MiniappAction; label: string } | null>(null);
  function select(next: Tab) { setTab(next); setDetail(null); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function openBot(action: MiniappAction) {
    const url = botActionUrl(username, action);
    if (!url) { setNotice('Бот пока не подключён. Попробуйте немного позже.'); return; }
    const app = telegram();
    if (app) app.openTelegramLink(url);
    else window.location.assign(url);
  }
  function ready() { const app = telegram(); app?.ready(); app?.expand(); app?.setHeaderColor('#171410'); app?.setBackgroundColor('#171410'); }
  useEffect(() => {
    const back = () => { if (detail) setDetail(null); else select('home'); };
    const app = telegram();
    if (tab !== 'home' || detail) app?.BackButton.show(); else app?.BackButton.hide();
    app?.BackButton.onClick(back);
    return () => app?.BackButton.offClick(back);
  }, [tab, detail]);
  const categories = ['Все', ...new Set(catalog.meditations.map(m => m.category).filter(Boolean))];
  const visible = category === 'Все' ? catalog.meditations : catalog.meditations.filter(m => m.category === category);
  return <div className="practice-world">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={ready} />
    <div className="practice-shell">
      <header className="practice-header"><button className="practice-brand" onClick={() => select('home')} aria-label="MAKSIM — главная">MAKSIM<span>ПРОСТРАНСТВО ПРАКТИК</span></button><button className="practice-account" aria-label="Мой доступ в Telegram" onClick={() => openBot('access')}><CircleUserRound size={21} strokeWidth={1.4} /></button></header>
      <main className="practice-main">
      {tab === 'home' ? <>
        <section className="practice-hero" aria-labelledby="hero-title">
          <div className="practice-hero-art" role="img" aria-label="Тёплый свет над тихим горным озером" />
          <div className="practice-hero-copy"><p className="practice-eyebrow"><span /> МЕСТО ДЛЯ СЕБЯ</p><h1 id="hero-title">Ближе<br />к настоящему.<br /><em>Ближе к себе.</em></h1><p>Медитации, живые встречи и люди,<br />с которыми можно быть собой.</p></div>
          <button className="practice-feature" onClick={() => openBot('free')}><span className="practice-feature-art"><Leaf size={31} strokeWidth={1} /></span><span><small>ВАШ ПЕРВЫЙ ШАГ</small><strong>Начать с тишины</strong><span>Попробовать бесплатную практику</span></span><ArrowRight size={22} strokeWidth={1.3} /></button>
        </section>
        <section className="practice-paths" aria-label="Исследуйте пространство"><button className="practice-path practice-path-earth" onClick={() => select('practices')}><AudioLines size={25} strokeWidth={1.2} /><h2>Практики<br />на каждый день</h2><span>Услышать себя <ArrowUpRight size={16} /></span></button><button className="practice-path practice-path-forest" onClick={() => select('events')}><CalendarDays size={25} strokeWidth={1.2} /><h2>Встречи<br />в настоящем</h2><span>Быть рядом <ArrowUpRight size={16} /></span></button></section>
        <section className="practice-note"><span className="practice-note-mark">✧</span><p>Можно никуда не спешить.<br /><em>Вы уже там, где нужно начать.</em></p><span>MAKSIM · ПРОСТРАНСТВО ПРАКТИК</span></section>
        <button className="practice-community-link" onClick={() => select('community')}><UsersRound size={25} strokeWidth={1.2} /><span><strong>Своё окружение</strong><small>Сообщество, в котором вас слышат</small></span><ArrowUpRight size={20} /></button>
      </> : <section className="practice-section" aria-labelledby="section-title">
        <button className="practice-back" onClick={() => select('home')}><ChevronLeft size={16} /> Главная</button>
        <p className="practice-eyebrow">MAKSIM / ПРОСТРАНСТВО ПРАКТИК</p>
        <h1 id="section-title">{tabs.find(t => t[0] === tab)?.[1]}</h1>
        <p className="practice-section-intro">{({ practices: 'Найдите свой ритм. Одна практика — один шаг к себе.', events: 'Время, которое мы проживаем вместе.', community: 'Место, где можно быть собой и чувствовать поддержку.', about: 'Человек за этим пространством.' } as const)[tab]}</p>
        {catalog.unavailable && tab !== 'about' && <p className="practice-empty" role="status">Не удалось загрузить материалы. Обновите страницу или откройте нужный раздел в боте.<button onClick={() => openBot(tab === 'practices' ? 'meditations' : tab)}>Открыть в Telegram <ArrowUpRight size={16} /></button></p>}
        {tab === 'practices' && <>
          <div className="practice-filters" aria-label="Категории практик">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
          {!visible.length && !catalog.unavailable && <p className="practice-empty">Здесь скоро появятся новые практики. А пока загляните в бот.</p>}
          <div className="practice-list">{visible.map(m => <button className="practice-material" key={m.id} onClick={() => setDetail({ title: m.title, description: m.description, action: 'meditations', label: 'Открыть практику в боте' })}><div className="practice-material-image" style={safeCover(m.coverUrl)}><span className="practice-play"><Play size={21} fill="currentColor" /></span><span className="practice-duration">{m.durationMinutes} мин</span></div><div className="practice-material-body"><span className="practice-material-tag">{m.free ? 'БЕСПЛАТНО' : m.category}</span><h2>{m.title}</h2><p>{m.description}</p><span className="practice-material-bottom">{m.category}<ArrowUpRight size={17} /></span></div></button>)}</div>
        </>}
        {tab === 'events' && <div className="practice-list">{!catalog.events.length && !catalog.unavailable && <p className="practice-empty">Новые встречи скоро появятся. Возвращайтесь — будем рады видеть вас.</p>}{catalog.events.map(e => <article className="practice-event" key={e.id}><div className="practice-event-cover" style={safeCover(e.coverUrl)}><CalendarDays size={32} strokeWidth={1} /></div><div><span className="practice-material-tag">{e.format}</span><h2>{e.title}</h2><p>{e.description}</p><p className="practice-event-date">{e.date} · {e.timezone}</p><button className="practice-cta" onClick={() => openBot('events')}>{e.registrationOpen ? 'Посмотреть и записаться' : 'Подробнее о встрече'}<ArrowUpRight size={17} /></button></div></article>)}</div>}
        {tab === 'community' && <><div className="practice-community-art"><UsersRound size={58} strokeWidth={.7} /><span>БЫТЬ. ЧУВСТВОВАТЬ. РАЗДЕЛЯТЬ.</span></div>{!catalog.communities.length && !catalog.unavailable && <p className="practice-empty">Набор в сообщество скоро откроется.</p>}{catalog.communities.map(p => <article className="practice-community-card" key={p.id}><h2>{p.title}</h2><p>{p.description}</p><span>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: p.currency }).format(p.price / 100)}{p.durationDays ? ` / ${p.durationDays} дней` : ' · бессрочно'}</span><button className="practice-cta" onClick={() => openBot('community')}>Узнать больше в боте <ArrowUpRight size={17} /></button></article>)}</>}
        {tab === 'about' && <><div className="practice-about-art"><span>М</span><small>МАКСИМ МАШКОВ</small></div><div className="practice-about-copy"><h2>Пространство,<br /><em>в котором есть вы.</em></h2><p>{catalog.about || 'Практики, медитации и живые встречи Максима Машкова. Пространство, чтобы замедлиться, услышать себя и вернуться к настоящему.'}</p><button className="practice-cta" onClick={() => openBot('consultation')}>Личная консультация <ArrowUpRight size={17} /></button><button className="practice-text-link" onClick={() => openBot('channel')}>Открытый Telegram-канал <ArrowUpRight size={15} /></button></div></>}
      </section>}
      <footer className="practice-footer"><span>БЕРЕЖНО К СЕБЕ. КАЖДЫЙ ДЕНЬ.</span><Link href="/login">Для команды <ArrowUpRight size={12} /></Link></footer>
      </main>
      <nav className="practice-nav" aria-label="Основная навигация">{tabs.map(([id, label, Icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => select(id)}><Icon size={23} strokeWidth={tab === id ? 1.8 : 1.3} /><span>{label}</span>{tab === id && <i />}</button>)}</nav>
      {notice && <div className="practice-notice" role="alert">{notice}<button onClick={() => setNotice('')} aria-label="Закрыть уведомление"><X size={18} /></button></div>}
      {detail && <DetailDialog detail={detail} onClose={() => setDetail(null)} openBot={openBot} />}
    </div>
  </div>;
}
function safeCover(url: string | null) {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? { backgroundImage: `linear-gradient(0deg,rgba(20,18,15,.25),transparent),url(${JSON.stringify(parsed.href)})` } : undefined; } catch { return undefined; }
}

function DetailDialog({ detail, onClose, openBot }: { detail: {title:string;description:string;action:MiniappAction;label:string}; onClose:()=>void; openBot:(action:MiniappAction)=>void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog=ref.current; dialog?.showModal(); const previous=document.body.style.overflow; document.body.style.overflow='hidden'; return () => { dialog?.close(); document.body.style.overflow=previous; }; }, []);
  return <dialog ref={ref} className="practice-modal" aria-labelledby="practice-detail-title" onCancel={onClose} onClick={event => {if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}><button autoFocus className="practice-modal-close" onClick={onClose} aria-label="Закрыть описание"><X /></button><Sparkles size={28} strokeWidth={1} /><h2 id="practice-detail-title">{detail.title}</h2><p>{detail.description}</p><button className="practice-cta" onClick={() => openBot(detail.action)}>{detail.label}<ArrowUpRight size={17} /></button><small>Аудио и ваш доступ — в Telegram-боте.</small></dialog>;
}
