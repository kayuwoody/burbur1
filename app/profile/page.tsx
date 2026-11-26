/**
 * /profile — vendor creates or edits their own business profile.
 * Required before checkout, so admins always have a name + contact number.
 * Vendor ID code and internal notes are admin-only and not shown here.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import VendorTypeSelect from '@/components/VendorTypeSelect';
import { invalidateVendorTypes } from '@/components/useVendorTypes';
import { SocialLinksInput } from '@/components/SocialLinks';
import SaveContact from '@/components/SaveContact';
import { useT } from '@/components/LanguageProvider';

export default function ProfilePage() {
  const { ready, me, refresh } = useRequireAuth('user');
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    phone: '',
    vendor_type_id: null as number | null,
    vendor_type_name: null as string | null, // typed when "Other" is chosen
    offerings: '',
    address: '',
    website: '',
    social_links: [] as string[],
    whatsapp_opt_in: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { t } = useT();

  // Pre-fill from the existing profile once auth has loaded.
  useEffect(() => {
    const v = me?.vendor;
    if (v) {
      setForm({
        business_name: v.business_name ?? '',
        contact_name: v.contact_name ?? '',
        phone: v.phone ?? '',
        vendor_type_id: v.vendor_type_id,
        vendor_type_name: null,
        offerings: v.offerings ?? '',
        address: v.address ?? '',
        website: v.website ?? '',
        social_links: v.social_links ?? [],
        whatsapp_opt_in: v.whatsapp_opt_in,
      });
    }
  }, [me?.vendor]);

  /** Generic field setter so each input is a one-liner. */
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({
      ...f,
      [k]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/me', { method: 'PUT', body: form });
      // A typed "Other" type may now exist: refresh the dropdown list.
      if (form.vendor_type_name) invalidateVendorTypes();
      await refresh();
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) router.replace(next);
      else setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.couldNotSave'));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div className="narrow card stack">
      <h1>{t(me?.vendor ? 'profile.edit' : 'profile.new')}</h1>
      <p className="muted small">{t('profile.loggedInAs', { email: me?.user.email ?? '' })}</p>
      <form onSubmit={submit} className="stack">
        <div>
          <label>{t('profile.business')}</label>
          <input required value={form.business_name} onChange={set('business_name')} />
        </div>
        <div>
          <label>{t('profile.type')}</label>
          <VendorTypeSelect
            typeId={form.vendor_type_id}
            typedName={form.vendor_type_name}
            onChange={(id, name) => setForm((f) => ({ ...f, vendor_type_id: id, vendor_type_name: name }))}
          />
        </div>
        <div>
          <label>{t('profile.offer')}</label>
          <textarea placeholder={t('profile.offerPh')} value={form.offerings} onChange={set('offerings')} />
        </div>
        <div>
          <label>{t('profile.contact')}</label>
          <input required value={form.contact_name} onChange={set('contact_name')} />
        </div>
        <div>
          <label>{t('profile.phone')}</label>
          <input required type="tel" placeholder="012-345 6789" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label>{t('profile.address')}</label>
          <textarea style={{ minHeight: 60 }} value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label>{t('profile.website')}</label>
          <input placeholder="example.com" value={form.website} onChange={set('website')} />
        </div>
        <div>
          <label>{t('profile.social')}</label>
          <SocialLinksInput value={form.social_links} onChange={(links) => setForm((f) => ({ ...f, social_links: links }))} />
        </div>
        <label className="check">
          <input type="checkbox" checked={form.whatsapp_opt_in} onChange={set('whatsapp_opt_in')} />
          {t('profile.optin')}
        </label>
        {/* Opted-in vendors also need our number saved for broadcasts to arrive. */}
        {form.whatsapp_opt_in && <SaveContact withNote />}
        {error && <p className="error small">{error}</p>}
        {saved && <p className="success small">{t('common.saved')}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </form>
    </div>
  );
}
