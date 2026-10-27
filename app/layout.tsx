/**
 * app/layout.tsx — root layout wrapping every page with the auth context
 * and the top navigation bar.
 */
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'Stall Booking',
  description: 'Book event stalls online',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Header />
          <main className="container">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
