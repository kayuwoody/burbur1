/**
 * components/LanguageProvider.tsx — the current language for the vendor site.
 *
 * CONCEPT: the server layout reads the visitor's choice from the `lang`
 * cookie (or guesses from their browser's language on a first visit) and
 * passes it in, so pages render in the right language from the first paint,
 * with no flash of English. Changing language updates the cookie for next time.
 *
 * Admin pages (/admin…) always get English, whatever the vendor-site choice.
 *
 * Usage in a component:  const { t, locale } = useT();  t('cart.title')
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LANG_COOKIE, LANGS, localeOf, translate, type Lang, type TKey } from '@/lib/i18n';

interface LangState {
  lang: Lang;
  /** Locale for dates, e.g. 'zh-CN'. */
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const LangCtx = createContext<LangState | null>(null);

export function LanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const pathname = usePathname();
  const [chosen, setChosen] = useState<Lang>(initial);
  // Admin area stays in English.
  const lang: Lang = pathname.startsWith('/admin') ? 'en' : chosen;

  // Keep <html lang> in step, so browsers pick the right fonts / voice.
  useEffect(() => {
    document.documentElement.lang = LANGS.find((l) => l.code === lang)!.htmlLang;
  }, [lang]);

  /** Switch language and remember it for a year. */
  const setLang = useCallback((l: Lang) => {
    setChosen(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  return <LangCtx.Provider value={{ lang, locale: localeOf(lang), setLang, t }}>{children}</LangCtx.Provider>;
}

export function useT(): LangState {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error('useT must be used inside <LanguageProvider>');
  return ctx;
}

/** EN · 中文 · BM switcher for the header. */
export function LanguageSwitcher() {
  const { lang, setLang } = useT();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} className={l.code === lang ? 'on' : undefined} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
