/**
 * /reset-password — landing page from the "reset password" email.
 * Supabase signs the user in via the link; here they choose a new password.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useT } from '@/components/LanguageProvider';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace('/');
  }

  return (
    <div className="narrow card stack">
      <h1>{t('reset.title')}</h1>
      <form onSubmit={submit} className="stack">
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error small">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{t('reset.save')}</button>
      </form>
    </div>
  );
}
