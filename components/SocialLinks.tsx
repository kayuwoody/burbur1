/**
 * components/SocialLinks.tsx — edit and display a vendor's social media links.
 *
 * CONCEPT: links are a plain list of URLs. The platform name (Instagram,
 * TikTok, Shopee…) is worked out from each URL's domain by socialPlatform(),
 * so vendors just paste their page link: no dropdown, no fixed slots.
 */
'use client';

import { normalizeUrl, socialPlatform } from '@/lib/util';
import { useT } from '@/components/LanguageProvider';

/**
 * Editable list: one input per link, a ✕ to remove, and "+ Add link".
 * Always shows at least one (empty) row so there's somewhere to type.
 */
export function SocialLinksInput({ value, onChange }: { value: string[]; onChange: (links: string[]) => void }) {
  const rows = value.length ? value : [''];
  const { t } = useT();

  /** Replace the link at index i. */
  const setAt = (i: number, v: string) => onChange(rows.map((r, j) => (j === i ? v : r)));
  /** Remove the link at index i. */
  const removeAt = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div className="stack" style={{ marginTop: 0 }}>
      {rows.map((link, i) => {
        // Show the detected platform next to the box once something is typed.
        const label = link.trim() ? socialPlatform(link).name : null;
        return (
          <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
            <input
              value={link}
              placeholder={t('social.placeholder')}
              onChange={(e) => setAt(i, e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            {label && <span className="pill" style={{ flexShrink: 0 }}>{label}</span>}
            {(rows.length > 1 || link) && (
              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeAt(i)} aria-label={t('social.remove')}>
                ✕
              </button>
            )}
          </div>
        );
      })}
      {rows.length < 10 && (
        <div>
          <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, ''])}>{t('social.add')}</button>
        </div>
      )}
    </div>
  );
}

/** Read-only row of link buttons, e.g. [Website] [Instagram @kopi.co] [TikTok]. */
export function SocialLinksDisplay({ website, links }: { website?: string | null; links?: string[] | null }) {
  const { t } = useT();
  if (!website && !links?.length) return null;
  return (
    <div className="row">
      {website && (
        <a className="btn btn-sm" href={normalizeUrl(website)} target="_blank" rel="noreferrer">{t('social.website')}</a>
      )}
      {links?.map((l) => {
        const p = socialPlatform(l);
        return (
          <a key={l} className="btn btn-sm" href={normalizeUrl(l)} target="_blank" rel="noreferrer" title={l}>
            {p.name}
            {p.handle && <span className="muted small">{p.handle}</span>}
          </a>
        );
      })}
    </div>
  );
}
