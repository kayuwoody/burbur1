/**
 * components/SaveContact.tsx — "Save our number" button for vendors.
 *
 * WHY: our "new markets open" announcements go out as WhatsApp broadcast
 * lists, and WhatsApp only delivers a broadcast to people who have the
 * sender's number saved in their contacts. This button downloads a contact
 * card (.vcf) for the market's number; on a phone, opening it offers
 * "Add contact" in one tap.
 *
 * The number comes from Admin → Settings (contact phone) via /api/site,
 * fetched once per page load and shared by every button on the page.
 */
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { downloadText, vcardFile } from '@/lib/vcard';
import { siteOrigin } from '@/lib/util';
import { useT } from './LanguageProvider';

type SiteContact = { company_name: string | null; contact_phone: string | null; contact_email: string | null };

/** One shared request for the site's contact details (several buttons may mount). */
let sitePromise: Promise<SiteContact | null> | null = null;
function loadSite(): Promise<SiteContact | null> {
  sitePromise ??= api<{ site: SiteContact }>('/api/site')
    .then((r) => r.site)
    .catch(() => null);
  return sitePromise;
}

export default function SaveContact({ withNote = false, className = 'btn btn-sm' }: { withNote?: boolean; className?: string }) {
  const { t } = useT();
  const [site, setSite] = useState<SiteContact | null>(null);

  useEffect(() => {
    loadSite().then(setSite);
  }, []);

  // No phone configured yet → nothing to save.
  if (!site?.contact_phone) return null;

  /** Build the market's contact card and download it. */
  const save = () =>
    downloadText(
      'Good-Vibes-Only-Market.vcf',
      vcardFile([
        {
          name: 'Good Vibes Only Market',
          phone: site.contact_phone,
          org: site.company_name ?? 'Maniacs Mansion Trading',
          url: siteOrigin(),
          note: site.contact_email ? `Email: ${site.contact_email}` : null,
        },
      ]),
    );

  const button = (
    <button type="button" className={className} onClick={save}>
      {t('save.btn')}
    </button>
  );
  if (!withNote) return button;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small muted">{t('save.why')}</span>
      <div>{button}</div>
    </div>
  );
}
