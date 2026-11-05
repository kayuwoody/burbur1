/**
 * app/layout.tsx — root layout: brand fonts, auth context, header, footer.
 *
 * CONCEPT: next/font downloads the Google fonts at BUILD time and serves
 * them from our own domain (no request to Google from visitors' browsers,
 * no layout shift). Each font is exposed as a CSS variable that
 * globals.css uses: --font-display for headings, --font-body for text.
 */
import type { Metadata, Viewport } from 'next';
import { Inter, Zilla_Slab } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';
import SiteFooter from '@/components/SiteFooter';

const display = Zilla_Slab({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Maniacs Mansion · Stall Booking',
  description: 'Book your stall at Maniacs Mansion bazaars and events.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#8b1414' };

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
