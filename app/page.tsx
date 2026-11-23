/**
 * / — the public landing page: brand hero, how booking works, and the
 * upcoming events that are open for booking (the "pick a date" step).
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { docAmount, eventDays, formatDateRange } from '@/lib/util';
import type { EventSummary } from '@/lib/types';
import { useT } from '@/components/LanguageProvider';

/**
 * Pieces for the ticket's date stub, in the chosen language:
 * '2026-11-13' → { mon: 'Nov' | '11月', day: 13, short: '13 Nov' | '11月13日' }.
 */
function stub(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const mon = d.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  return { mon, day, short: locale.startsWith('zh') ? `${d.getUTCMonth() + 1}月${day}日` : `${day} ${mon}` };
}

export default function HomePage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useT();

  useEffect(() => {
    api<{ events: EventSummary[] }>('/api/events')
      .then((r) => setEvents(r.events))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gvo-logo-256.png" alt="Good Vibes Only Market: Weekend Community Bazaar" />
        <div className="eyebrow">{t('home.eyebrow')}</div>
        <h1>{t('home.title')}</h1>
        <p>{t('home.sub')}</p>
        <div className="row">
          <a href="#events" className="btn btn-primary btn-lg">{t('home.cta')}</a>
          <Link href="/login" className="btn btn-ghost btn-lg">{t('home.login')}</Link>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <div className="steps">
        <div className="step">
          <div className="step-no">1</div>
          <div><strong>{t('home.step1')}</strong><span>{t('home.step1b')}</span></div>
        </div>
        <div className="step">
          <div className="step-no">2</div>
          <div><strong>{t('home.step2')}</strong><span>{t('home.step2b')}</span></div>
        </div>
        <div className="step">
          <div className="step-no">3</div>
          <div><strong>{t('home.step3')}</strong><span>{t('home.step3b')}</span></div>
        </div>
      </div>

      {/* ---------- Events ---------- */}
      <div className="section-title" id="events">
        <h2>{t('home.upcoming')}</h2>
      </div>
      {error && <p className="error">{error}</p>}
      {!events && !error && <p className="muted">{t('common.loading')}</p>}
      {events?.length === 0 && (
        <div className="card muted">
          {t('home.none')}{' '}
          <a href="https://www.facebook.com/profile.php?id=61592121695936" target="_blank" rel="noreferrer">{t('home.noneLink')}</a>{' '}
          {t('home.noneAfter')}
        </div>
      )}
      <div className="grid-tickets">
        {events?.map((e) => {
          const s = stub(e.start_date, locale);
          const days = eventDays(e.start_date, e.end_date);
          const offered = e.counts.total - e.counts.blocked;
          const pct = offered ? Math.round((e.counts.available / offered) * 100) : 0;
          return (
            <Link key={e.id} href={`/events/${e.id}`} className="ticket">
              <div className="ticket-date">
                <span className="mon">{s.mon}</span>
                <span className="day">{s.day}</span>
                {days > 1 && <span className="to">{t('home.to', { date: stub(e.end_date, locale).short })}</span>}
              </div>
              <div className="ticket-body">
                <h3>{e.name}</h3>
                <div className="ticket-meta">
                  {formatDateRange(e.start_date, e.end_date, locale)}
                  {days > 1 && ` · ${t('home.days', { n: days })}`}
                  {e.venue && <> · {e.venue}</>}
                </div>
                {/* Gold bar: share of stalls still free */}
                <div className="avail" title={t('home.left', { n: e.counts.available, total: offered })}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="ticket-foot">
                  <span>{t('home.left', { n: e.counts.available, total: offered })}</span>
                  {e.min_price !== null && (
                    <span className="ticket-price">
                      <strong>{t('home.from', { price: `RM ${docAmount(e.min_price)}` })}</strong>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
