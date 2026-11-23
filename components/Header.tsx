/**
 * components/Header.tsx — top navigation.
 *
 * Shows vendor links (Events, Cart, My bookings) on the public site and
 * admin links inside /admin. There is deliberately no link from the public
 * site to /admin; admins go there directly by URL.
 */
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useCart } from '@/lib/cart';
import { LanguageSwitcher, useT } from './LanguageProvider';

export default function Header() {
  const { session, me, signOut } = useAuth();
  const cart = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();

  /** Highlight the nav link for the current section. */
  const cls = (href: string) =>
    (href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'active' : undefined;

  const inAdmin = pathname.startsWith('/admin');

  return (
    <header className="header">
      <div className="header-inner">
        {/* Public site = the bazaar's brand (Good Vibes Only Market).
            Admin = the company running it (Maniacs Mansion). */}
        <Link href={inAdmin ? '/admin' : '/'} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={inAdmin ? '/brand/logo-96.png' : '/brand/gvo-logo-128.png'} alt="" />
          <span>
            <span className="brand-name">{inAdmin ? 'Maniacs Mansion' : 'Good Vibes Only Market'}</span>
            <span className="brand-sub">{inAdmin ? 'Admin' : t('brand.sub')}</span>
          </span>
        </Link>
        <nav className="nav">
          {inAdmin ? (
            <>
              <Link href="/admin/events" className={cls('/admin/events')}>Events</Link>
              <Link href="/admin/bookings" className={cls('/admin/bookings')}>Bookings</Link>
              <Link href="/admin/vendors" className={cls('/admin/vendors')}>Vendors</Link>
              <Link href="/admin/notify" className={cls('/admin/notify')}>Notify</Link>
              <Link href="/admin/settings" className={cls('/admin/settings')}>Settings</Link>
              <Link href="/">Vendor site</Link>
            </>
          ) : (
            <>
              <Link href="/" className={cls('/')}>{t('nav.markets')}</Link>
              <Link href="/cart" className={cls('/cart')}>
                {t('nav.cart')}{cart.length > 0 && <span className="badge-count">{cart.length}</span>}
              </Link>
              {session && <Link href="/bookings" className={cls('/bookings')}>{t('nav.bookings')}</Link>}
              {session && <Link href="/profile" className={cls('/profile')}>{t('nav.profile')}</Link>}
            </>
          )}
          {session ? (
            <button
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
            >
              {t('nav.logout')}
            </button>
          ) : (
            <Link href="/login" className={cls('/login')}>{t('nav.login')}</Link>
          )}
          {/* Language choice: vendor site only (admin stays English) */}
          {!inAdmin && <LanguageSwitcher />}
        </nav>
      </div>
    </header>
  );
}
