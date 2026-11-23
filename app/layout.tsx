/**
 * app/layout.tsx — root layout: brand fonts, auth context, header, footer.
 *
 * CONCEPT: next/font downloads the Google fonts at BUILD time and serves
 * them from our own domain (no request to Google from visitors' browsers,
 * no layout shift). Each font is exposed as a CSS variable that
 * globals.css uses: --font-display for headings, --font-body for text.
 */
import type { Metadata, Viewport } from 'next';
import { Amatic_SC, Nunito } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';
import SiteFooter from '@/components/SiteFooter';
import { LanguageProvider } from '@/components/LanguageProvider';
import { cookies, headers } from 'next/headers';
import { isLang, LANG_COOKIE, LANGS, type Lang } from '@/lib/i18n';

/**
 * Pick the starting language: the visitor's saved choice (cookie) if any,
 * otherwise their browser's language (Chinese / Malay), otherwise English.
 */
function initialLang(): Lang {
  const saved = cookies().get(LANG_COOKIE)?.value;
  if (isLang(saved)) return saved;
  const accept = (headers().get('accept-language') ?? '').toLowerCase();
  const first = accept.split(',')[0]?.trim() ?? '';
  if (first.startsWith('zh')) return 'zh';
  if (first.startsWith('ms')) return 'ms';
  return 'en';
}

// Amatic SC: hand-drawn capitals, close to the "GOOD VIBES ONLY MARKET" badge lettering.
const display = Amatic_SC({ subsets: ['latin'], weight: ['700'], variable: '--font-display' });
// Nunito: rounded, friendly and very readable for body text and forms.
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Good Vibes Only Market · Stall booking',
  description: 'Book your stall at Good Vibes Only Market, the weekend community bazaar by Maniacs Mansion.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#8abbb5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = initialLang();
  return (
    <html lang={LANGS.find((l) => l.code === lang)!.htmlLang} className={`${display.variable} ${body.variable}`}>
      <body>
        <LanguageProvider initial={lang}>
          <AuthProvider>
            <Header />
            <main className="container">{children}</main>
            <SiteFooter />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
