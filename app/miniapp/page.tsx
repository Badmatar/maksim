import { db } from '@/lib/db';
import { defaultTexts, resolveEditorialText } from '@/lib/editorial';
import { PracticeApp, type Catalog } from './practice-app';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'MAKSIM · Возвращение к себе' };
export default async function Miniapp() {
  let catalog: Catalog = { meditations: [], events: [], communities: [], about: defaultTexts.about, unavailable: false };
  try {
    const [meditations, events, communities, texts] = await Promise.all([
      db.meditation.findMany({ where: { published: true }, select: { id: true, title: true, description: true, category: true, durationMinutes: true, free: true, coverUrl: true }, orderBy: [{ free: 'desc' }, { title: 'asc' }], take: 60 }),
      db.event.findMany({ where: { published: true, startsAt: { gt: new Date() } }, select: { id: true, title: true, description: true, format: true, startsAt: true, timezone: true, registrationOpen: true, coverUrl: true }, orderBy: { startsAt: 'asc' }, take: 30 }),
      db.product.findMany({ where: { published: true, kind: 'COMMUNITY' }, select: { id: true, title: true, description: true, price: true, currency: true, durationDays: true }, take: 20 }),
      db.setting.findMany({ where: { key: { in: ['about', 'eventsText', 'communityText'] } }, select: { key: true, value: true } }),
    ]);
    catalog = { meditations, events: events.map(({ startsAt, ...e }) => ({ ...e, date: startsAt.toLocaleString('ru-RU', { timeZone: e.timezone, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })), communities, about: resolveEditorialText('about', texts.find(t => t.key === 'about')?.value), texts: { events: resolveEditorialText('eventsText', texts.find(t => t.key === 'eventsText')?.value), community: resolveEditorialText('communityText', texts.find(t => t.key === 'communityText')?.value) }, unavailable: false };
  } catch {
    // Keep the public landing usable without exposing infrastructure details.
    catalog.unavailable = true;
  }
  return <PracticeApp catalog={catalog} username={process.env.NEXT_PUBLIC_BOT_USERNAME} />;
}
