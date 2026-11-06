'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, AudioLines, CalendarDays, CircleUserRound, Home, Leaf, Play, Sparkles, UsersRound, MessageCircle, X, ChevronLeft } from 'lucide-react';
import { writtenPractices, everydayNotes, communityPrinciples, meetingFormats, commonQuestions, defaultTexts, practiceText } from '@/lib/editorial';
import { botActionUrl, type MiniappAction } from '@/lib/miniapp';
import {PracticeBuilder} from './practice-builder';
import {FeedbackForm} from './feedback-form';
import './practice-app.css';
import './light-theme.css';
export type Catalog = {
  meditations: { id: string; title: string; description: string; category: string; durationMinutes: number; free: boolean; coverUrl: string | null }[];
  events: { id: string; title: string; description: string; format: string; date: string; timezone: string; registrationOpen: boolean; coverUrl: string | null }[];
  communities: { id: string; title: string; description: string; price: number; currency: string; durationDays: number | null }[];
  about: string; texts?: { events: string; community: string }; unavailable: boolean;
};
type Tab = 'home' | 'practices' | 'events' | 'community' | 'about' | 'builder' | 'feedback';
type TelegramApp = { initData: string; ready: () => void; expand: () => void; setHeaderColor: (color: string) => void; setBackgroundColor: (color: string) => void; openTelegramLink: (url: string) => void; BackButton: { show: () => void; hide: () => void; onClick: (fn: () => void) => void; offClick: (fn: () => void) => void } };
function telegram() { return (window as Window & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp; }
const tabs = [ ['home', 'Главная', Home], ['practices', 'Практики', AudioLines], ['events', 'Встречи', CalendarDays], ['community', 'Сообщество', UsersRound], ['about', 'О Максиме', CircleUserRound] ] as const;
export function PracticeApp({ catalog, username }: { catalog: Catalog; username?: string }) {
  const [tab, setTab] = useState<Tab>('home');
  const [category, setCategory] = useState('Все');
  const [feedbackContext,setFeedbackContext]=useState('');
  function feedback(context=''){setFeedbackContext(context);select('feedback');}
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<{ title: string; description: string; action?: MiniappAction; label?: string } | null>(null);
  function select(next: Tab) { setTab(next); setDetail(null); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function openBot(action: MiniappAction) {
    const url = botActionUrl(username, action);
    if (!url) { setNotice('Бот пока не подключён. Попробуйте немного позже.'); return; }
    const app = telegram();
    if (app) app.openTelegramLink(url);
    else window.location.assign(url);
  }
  function ready() { const app = telegram(); app?.ready(); app?.expand(); app?.setHeaderColor('#f7f2ea'); app?.setBackgroundColor('#f7f2ea'); }
  useEffect(() => {
    const back = () => { if (detail) setDetail(null); else select('home'); };
    const app = telegram();
    if (tab !== 'home' || detail) app?.BackButton.show(); else app?.BackButton.hide();
    app?.BackButton.onClick(back);
    return () => app?.BackButton.offClick(back);
  }, [tab, detail]);
  const categories = ['Все', ...new Set([...writtenPractices.map(p => p.category), ...catalog.meditations.map(m => m.category)].filter(Boolean))];
  const readings = category === 'Все' ? writtenPractices : writtenPractices.filter(p => p.category === category);
  const visible = category === 'Все' ? catalog.meditations : catalog.meditations.filter(m => m.category === category);
  return <div className="practice-world">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={ready} />
    <div className="practice-shell">
      <header className="practice-header"><button className="practice-brand" onClick={() => select('home')} aria-label="MAKSIM — главная">MAKSIM<span>ПРОСТРАНСТВО ПРАКТИК</span></button><div className="practice-header-actions"><button className="practice-account" aria-label="Обратная связь" onClick={()=>feedback()}><MessageCircle size={20} strokeWidth={1.4}/></button><button className="practice-account" aria-label="Мой доступ в Telegram" onClick={() => openBot('access')}><CircleUserRound size={21} strokeWidth={1.4} /></button></div></header>
      <main className="practice-main">
      {tab === 'home' ? <>
        <section className="practice-hero" aria-labelledby="hero-title">
          <div className="practice-hero-art"><PortraitPhoto alt="Максим Машков — открытый взгляд и приглашающий жест" priority /></div>
          <div className="practice-hero-copy"><p className="practice-eyebrow"><span /> МЕСТО ДЛЯ СЕБЯ</p><h1 id="hero-title">Ближе<br />к настоящему.<br /><em>Ближе к себе.</em></h1><p>Медитации, живые встречи и люди,<br />с которыми можно быть собой.</p></div>
          <button className="practice-feature" onClick={() => openBot('free')}><span className="practice-feature-art"><Leaf size={31} strokeWidth={1} /></span><span><small>ВАШ ПЕРВЫЙ ШАГ</small><strong>Начать с тишины</strong><span>Попробовать бесплатную практику</span></span><ArrowRight size={22} strokeWidth={1.3} /></button>
        </section>
        <button className="practice-builder-link" onClick={()=>select('builder')}><Sparkles size={24} strokeWidth={1}/><span><strong>Практика для меня</strong><small>Пять вопросов — и ваш путь на 3, 5 или 10 минут</small></span><ArrowUpRight size={20}/></button>
        <section className="practice-paths" aria-label="Исследуйте пространство"><button className="practice-path practice-path-earth" onClick={() => select('practices')}><PortraitPhoto panel="meditation" /><AudioLines size={25} strokeWidth={1.2} /><h2>Практики<br />на каждый день</h2><span>Услышать себя <ArrowUpRight size={16} /></span></button><button className="practice-path practice-path-forest" onClick={() => select('events')}><PortraitPhoto panel="window" /><CalendarDays size={25} strokeWidth={1.2} /><h2>Встречи<br />в настоящем</h2><span>Быть рядом <ArrowUpRight size={16} /></span></button></section>
        <section className="practice-day-notes" aria-label="Внимание к себе в течение дня"><h2>Место для себя<br /><em>в обычном дне.</em></h2>{everydayNotes.map(note => <article key={note.title}><h3>{note.title}</h3><p>{note.text}</p></article>)}</section><section className="practice-note"><span className="practice-note-mark">✧</span><p>Можно никуда не спешить.<br /><em>Вы уже там, где нужно начать.</em></p><span>MAKSIM · ПРОСТРАНСТВО ПРАКТИК</span></section>
        <button className="practice-community-link" onClick={() => select('community')}><UsersRound size={25} strokeWidth={1.2} /><span><strong>Своё окружение</strong><small>Сообщество, в котором вас слышат</small></span><ArrowUpRight size={20} /></button>
      </> : <section className="practice-section" aria-labelledby="section-title">
        <button className="practice-back" onClick={() => select('home')}><ChevronLeft size={16} /> Главная</button>
        <p className="practice-eyebrow">MAKSIM / ПРОСТРАНСТВО ПРАКТИК</p>
        <h1 id="section-title">{tab==='builder'?'Практика для меня':tab==='feedback'?'Обратная связь':tabs.find(t => t[0] === tab)?.[1]}</h1>
        <p className="practice-section-intro">{({ practices: 'Найдите свой ритм. Одна практика — один шаг к себе.', events: 'Время, которое мы проживаем вместе.', community: 'Место, где можно быть собой и чувствовать поддержку.', about: 'Человек за этим пространством.', builder: 'Выберите, что подходит вам сейчас. Соберём последовательность из готовых упражнений.', feedback: 'Ваши вопросы, идеи и впечатления помогают делать пространство удобнее.' } as const)[tab]}</p>
        {catalog.unavailable && !['about','builder','feedback'].includes(tab) && <p className="practice-empty" role="status">Не удалось загрузить аудио и расписание. Текстовые практики и описания доступны ниже. Можно также открыть нужный раздел в боте.<button onClick={() => openBot(tab === 'events' ? 'events' : tab === 'community' ? 'community' : 'meditations')}>Открыть в Telegram <ArrowUpRight size={16} /></button></p>}
        {tab==='builder'&&<PracticeBuilder onFeedback={feedback}/>}
        {tab==='feedback'&&<FeedbackForm key={feedbackContext} context={feedbackContext} onDone={()=>select('home')}/>}
        {tab === 'practices' && <>
          <button className="practice-builder-link practice-builder-link--inside" onClick={()=>select('builder')}><Sparkles size={24}/><span><strong>Собрать свою практику</strong><small>Под своё время и предпочтения</small></span><ArrowRight size={19}/></button>
          <div className="practice-filters" aria-label="Категории практик">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="practice-reading-intro"><h2>Небольшие шаги к себе</h2><p>Бесплатные текстовые практики. Прочитайте шаги и попробуйте их в удобном темпе — особая подготовка не нужна.</p></div>
          <div className="practice-reading-list">{readings.map(p => <button className="practice-reading" key={p.id} onClick={() => setDetail({ title: p.title, description: practiceText(p).split('\n').slice(1).join('\n').trim() })}><span className="practice-material-tag">{p.category} · {p.minutes} мин</span><h2>{p.title}</h2><p>{p.description}</p><span>Прочитать практику <ArrowUpRight size={17} /></span></button>)}</div>
          {visible.length > 0 && <h2 className="practice-audio-heading">Аудиопрактики</h2>}
          <div className="practice-list">{visible.map(m => <button className="practice-material" key={m.id} onClick={() => setDetail({ title: m.title, description: m.description, action: 'meditations', label: 'Открыть практику в боте' })}><div className="practice-material-image" style={safeCover(m.coverUrl)}>{!safeCover(m.coverUrl) && <PortraitPhoto panel="meditation" />}<span className="practice-play"><Play size={21} fill="currentColor" /></span><span className="practice-duration">{m.durationMinutes} мин</span></div><div className="practice-material-body"><span className="practice-material-tag">{m.free ? 'БЕСПЛАТНО' : m.category}</span><h2>{m.title}</h2><p>{m.description}</p><span className="practice-material-bottom">{m.category}<ArrowUpRight size={17} /></span></div></button>)}</div>
        </>}
        {tab === 'events' && <><p className="practice-editorial-intro">{catalog.texts?.events ?? defaultTexts.eventsText}</p><div className="practice-information-list">{meetingFormats.map(item => <article key={item.title}><h2>{item.title}</h2><p>{item.text}</p></article>)}</div><div className="practice-list">{!catalog.events.length && !catalog.unavailable && <p className="practice-empty">Открытых записей пока нет. Здесь появятся карточки событий с датой и условиями участия.</p>}{catalog.events.map(e => <article className="practice-event" key={e.id}><div className="practice-event-cover" style={safeCover(e.coverUrl)}>{!safeCover(e.coverUrl) && <PortraitPhoto panel="window" />}<CalendarDays size={32} strokeWidth={1} /></div><div><span className="practice-material-tag">{e.format}</span><h2>{e.title}</h2><p>{e.description}</p><p className="practice-event-date">{e.date} · {e.timezone}</p><button className="practice-cta" onClick={() => openBot('events')}>{e.registrationOpen ? 'Посмотреть и записаться' : 'Подробнее о встрече'}<ArrowUpRight size={17} /></button></div></article>)}</div></>}
        {tab === 'community' && <><div className="practice-community-art"><UsersRound size={58} strokeWidth={.7} /><span>БЫТЬ. ЧУВСТВОВАТЬ. РАЗДЕЛЯТЬ.</span></div><p className="practice-editorial-intro">{catalog.texts?.community ?? defaultTexts.communityText}</p><div className="practice-information-list">{communityPrinciples.map(item => <article key={item.title}><h2>{item.title}</h2><p>{item.text}</p></article>)}</div>{!catalog.communities.length && !catalog.unavailable && <p className="practice-empty">Предложения для вступления пока не опубликованы. Можно оставить вопрос об участии через консультацию.</p>}{catalog.communities.map(p => <article className="practice-community-card" key={p.id}><h2>{p.title}</h2><p>{p.description}</p><span>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: p.currency }).format(p.price / 100)}{p.durationDays ? ` / ${p.durationDays} дней` : ' · бессрочно'}</span><button className="practice-cta" onClick={() => openBot('community')}>Узнать больше в боте <ArrowUpRight size={17} /></button></article>)}</>}
        {tab === 'about' && <><div className="practice-about-art"><PortraitPhoto panel="seated" alt="Максим Машков в тёплом интерьере" /><small>МАКСИМ МАШКОВ</small></div><div className="practice-about-copy"><h2>Пространство,<br /><em>в котором есть вы.</em></h2><p>{catalog.about || defaultTexts.about}</p><button className="practice-cta" onClick={() => openBot('consultation')}>Личная консультация <ArrowUpRight size={17} /></button><button className="practice-text-link" onClick={() => openBot('channel')}>Открытый Telegram-канал <ArrowUpRight size={15} /></button></div></>}
      </section>}
      {(tab === 'home' || tab === 'about') && <section className="practice-faq"><h2>Если вы здесь впервые</h2>{commonQuestions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>}
      <footer className="practice-footer"><button className="practice-feedback-link" onClick={()=>feedback()}>Обратная связь <ArrowUpRight size={13}/></button><span>БЕРЕЖНО К СЕБЕ. КАЖДЫЙ ДЕНЬ.</span><Link href="/login">Для команды <ArrowUpRight size={12} /></Link></footer>
      </main>
      <nav className="practice-nav" aria-label="Основная навигация">{tabs.map(([id, label, Icon]) => <button key={id} aria-current={tab === id || (id==='practices' && tab==='builder') ? 'page' : undefined} onClick={() => select(id)}><Icon size={23} strokeWidth={tab === id ? 1.8 : 1.3} /><span>{label}</span>{tab === id && <i />}</button>)}</nav>
      {notice && <div className="practice-notice" role="alert">{notice}<button onClick={() => setNotice('')} aria-label="Закрыть уведомление"><X size={18} /></button></div>}
      {detail && <DetailDialog detail={detail} onClose={() => setDetail(null)} openBot={openBot} />}
    </div>
  </div>;
}
function safeCover(url: string | null) {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? { backgroundImage: `linear-gradient(0deg,rgba(20,18,15,.25),transparent),url(${JSON.stringify(parsed.href)})` } : undefined; } catch { return undefined; }
}

function DetailDialog({ detail, onClose, openBot }: { detail: {title:string;description:string;action?:MiniappAction;label?:string}; onClose:()=>void; openBot:(action:MiniappAction)=>void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog=ref.current; dialog?.showModal(); const previous=document.body.style.overflow; document.body.style.overflow='hidden'; return () => { dialog?.close(); document.body.style.overflow=previous; }; }, []);
  return <dialog ref={ref} className="practice-modal" aria-labelledby="practice-detail-title" onCancel={onClose} onClick={event => {if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}><button autoFocus className="practice-modal-close" onClick={onClose} aria-label="Закрыть описание"><X /></button><Sparkles size={28} strokeWidth={1} /><h2 id="practice-detail-title">{detail.title}</h2><p>{detail.description}</p>{detail.action ? <><button className="practice-cta" onClick={() => openBot(detail.action!)}>{detail.label}<ArrowUpRight size={17} /></button><small>Аудио и ваш доступ — в Telegram-боте.</small></> : <button className="practice-cta" onClick={onClose}>Завершить чтение <Leaf size={17} /></button>}</dialog>;
}

// Keep the original generated photos intact. Individual triptych frames are
// selected by the layout; Next Image serves responsive, compressed versions.
function PortraitPhoto({ panel, alt = '', priority = false }: { panel?: 'meditation' | 'seated' | 'window'; alt?: string; priority?: boolean }) {
  const index = panel ? { meditation: 0, seated: 1, window: 2 }[panel] : 0;
  return <div className={`portrait-photo${panel ? ' portrait-photo--panel' : ''}`}><Image src={panel ? '/images/maksim-portraits.png' : '/images/maksim-welcome.png'} alt={alt} fill quality={85} priority={priority} sizes={panel ? '(max-width: 500px) 1500px, 1500px' : '(max-width: 500px) 100vw, 500px'} style={panel ? { width: '300%', maxWidth: 'none', left: `${-index * 100}%`, right: 'auto', objectFit: 'cover' } : { objectFit: 'cover', objectPosition: 'center 20%' }} /></div>;
}
