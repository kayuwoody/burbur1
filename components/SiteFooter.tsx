/**
 * components/SiteFooter.tsx — dark footer with logo and contact details,
 * shown on vendor-facing pages (hidden in /admin).
 *
 * Contact details come from Admin → Settings via /api/site, so changing the
 * phone number there updates the website too.
 */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { waLink } from '@/lib/util';

type Site = {
  company_name: string | null;
  footer_brand: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

export default function SiteFooter() {
  const pathname = usePathname();
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    api<{ site: Site }>('/api/site')
      .then((r) => setSite(r.site))
      .catch(() => setSite(null));
  }, []);

  if (pathname.startsWith('/admin')) return null;
  const wa = waLink(site?.contact_phone, 'Hi! I have a question about booking a stall.');

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-96.png" alt="" />
        <div>
          <strong>{site?.footer_brand ?? 'Maniacs Mansion'}</strong>
          {site?.company_name ?? 'Maniacs Mansion Trading'}
        </div>
        <div className="spacer" />
        <div>
          {site?.contact_name && <div>Questions? {site.contact_name}</div>}
          <div className="row" style={{ gap: 12 }}>
            {site?.contact_phone && (wa ? <a href={wa} target="_blank" rel="noreferrer">WhatsApp {site.contact_phone}</a> : <span>{site.contact_phone}</span>)}
            {site?.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
          </div>
        </div>
      </div>
    </footer>
  );
}
