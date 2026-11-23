/**
 * /setup/[token] — vendor setup form, opened from a secret link (no login).
 *
 * Two sections:
 *   1. Setup crew: name + IC for each person, so the venue's security office
 *      can issue work passes. At least one person.
 *   2. Power: anything beyond standard items (LED lighting, phone/laptop
 *      chargers)? If yes, list each appliance and its wattage (0 or more).
 * Saved answers load back in, and can be edited until the event ends.
 */
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateRange, formatDateTime } from '@/lib/util';
import { useT } from '@/components/LanguageProvider';

type Worker = { name: string; ic: string };
type Item = { device: string; watts: string }; // watts kept as typed text while editing
type FormData = {
  event: { id: string; name: string; start_date: string; end_date: string; venue: string | null };
  vendor_name: string;
  stalls: string[];
  workers: Worker[];
  extra_power: boolean | null;
  power_items: { device: string; watts: number }[];
  submitted_at: string | null;
  updated_at: string | null;
  locked: boolean;
};

const blankWorker = (): Worker => ({ name: '', ic: '' });
const blankItem = (): Item => ({ device: '', watts: '' });

export default function SetupFormPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([blankWorker()]);
  const [extraPower, setExtraPower] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const { t, locale } = useT();

  // Load the form and any saved answers.
  useEffect(() => {
    api<FormData>(`/api/setup/${params.token}`)
      .then((d) => {
        setData(d);
        if (d.workers.length) setWorkers(d.workers);
        setExtraPower(d.extra_power);
        if (d.power_items.length) setItems(d.power_items.map((p) => ({ device: p.device, watts: String(p.watts) })));
      })
      .catch((e: Error) => setError(e.message));
  }, [params.token]);

  /** Update one field of one row in a list. */
  function edit<T>(list: T[], set: (l: T[]) => void, i: number, patch: Partial<T>) {
    set(list.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ updated_at: string }>(`/api/setup/${params.token}`, {
        method: 'PUT',
        body: { workers, extra_power: extraPower, power_items: extraPower ? items : [] },
      });
      setData((d) => (d ? { ...d, updated_at: r.updated_at, submitted_at: d.submitted_at ?? r.updated_at } : d));
      setMsg({ text: t('setup.thanks') });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : t('common.couldNotSave'), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="narrow card"><h1>{t('setup.title')}</h1><p className="error">{error}</p></div>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;

  const totalWatts = items.reduce((s, it) => s + (Number(it.watts) || 0), 0);
  const disabled = data.locked || busy;

  return (
    <div className="narrow">
      <div className="card stack">
        <div>
          <div className="small muted">
            {formatDateRange(data.event.start_date, data.event.end_date, locale)}
            {data.event.venue && <> · {data.event.venue}</>}
          </div>
          <h1 style={{ margin: '4px 0' }}>{t('setup.title')}</h1>
          <div>
            <strong>{data.vendor_name}</strong> · {data.event.name}
            {data.stalls.length > 0 && <> · {t('setup.stalls', { list: data.stalls.join(', ') })}</>}
          </div>
        </div>
        {data.updated_at && (
          <p className="small success" style={{ margin: 0 }}>{t('setup.lastSaved', { time: formatDateTime(data.updated_at, locale) })}</p>
        )}
        {data.locked && <p className="small error" style={{ margin: 0 }}>{t('setup.locked')}</p>}
      </div>

      <form onSubmit={submit}>
        {/* ---------- 1. Setup crew / work passes ---------- */}
        <fieldset className="card stack" disabled={disabled} style={{ border: '1px solid var(--border)' }}>
          <h2 style={{ marginTop: 0 }}>{t('setup.crewTitle')}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('setup.crewNote')}
          </p>
          {workers.map((w, i) => (
            <div key={i} className="setup-row">
              <div>
                <label>{t('setup.fullName')}</label>
                <input required value={w.name} placeholder={t('setup.namePh')} onChange={(e) => edit(workers, setWorkers, i, { name: e.target.value })} />
              </div>
              <div>
                <label>{t('setup.ic')}</label>
                <input required inputMode="numeric" value={w.ic} placeholder={t('setup.icPh')} onChange={(e) => edit(workers, setWorkers, i, { ic: e.target.value })} />
              </div>
              {workers.length > 1 && (
                <button type="button" className="btn btn-sm btn-danger" aria-label={t('setup.removePerson', { n: i + 1 })} onClick={() => setWorkers(workers.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <div><button type="button" className="btn btn-sm" onClick={() => setWorkers([...workers, blankWorker()])}>{t('setup.addPerson')}</button></div>
        </fieldset>

        {/* ---------- 2. Power requirements ---------- */}
        <fieldset className="card stack" disabled={disabled} style={{ border: '1px solid var(--border)' }}>
          <h2 style={{ marginTop: 0 }}>{t('setup.powerTitle')}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('setup.powerNote')}
          </p>
          <div>
            <label style={{ color: 'var(--text)', fontWeight: 700 }}>{t('setup.powerQ')}</label>
            {/* Stacked so each answer reads on one line, even on a phone */}
            <div className="stack" style={{ marginTop: 6 }}>
              <label className="check"><input type="radio" name="extra" required checked={extraPower === false} onChange={() => setExtraPower(false)} /> {t('setup.powerNo')}</label>
              <label className="check"><input type="radio" name="extra" checked={extraPower === true} onChange={() => setExtraPower(true)} /> {t('setup.powerYes')}</label>
            </div>
          </div>
          {extraPower && (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                {t('setup.powerList')}
              </p>
              {items.map((it, i) => (
                <div key={i} className="setup-row">
                  <div>
                    <label>{t('setup.device')}</label>
                    <input value={it.device} placeholder={t('setup.devicePh')} onChange={(e) => edit(items, setItems, i, { device: e.target.value })} />
                  </div>
                  <div>
                    <label>{t('setup.watts')}</label>
                    <input inputMode="numeric" value={it.watts} placeholder="900" onChange={(e) => edit(items, setItems, i, { watts: e.target.value })} />
                  </div>
                  {items.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" aria-label={t('setup.removeItem', { n: i + 1 })} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              <div className="spread">
                <button type="button" className="btn btn-sm" onClick={() => setItems([...items, blankItem()])}>{t('setup.addItem')}</button>
                {totalWatts > 0 && <strong className="small">{t('setup.total', { w: totalWatts.toLocaleString() })}</strong>}
              </div>
            </>
          )}
        </fieldset>

        {msg && <p className={`card small ${msg.error ? 'error' : 'success'}`}>{msg.text}</p>}
        {!data.locked && (
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? t('common.saving') : t(data.submitted_at ? 'setup.saveChanges' : 'setup.submit')}
          </button>
        )}
      </form>
    </div>
  );
}
