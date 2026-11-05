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
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AuthProvider>
          <Header />
          <main className="container">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
