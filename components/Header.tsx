/**
 * components/Header.tsx — top navigation.
 *
 * Shows vendor links (Events, Cart, My bookings) to everyone, admin links
 * only to admins, and Log in / Log out depending on session.
 */
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useCart } from '@/lib/cart';

export default function Header() {
  const { session, me, signOut } = useAuth();
  const cart = useCart();
  const pathname = usePathname();
  const router = useRouter();

  /** Highlight the nav link for the current section. */
  const cls = (href: string) =>
    (href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'active' : undefined;

  const inAdmin = pathname.startsWith('/admin');

  return (
    <header className="header">
      <div className="header-inner">
        <Link href={inAdmin ? '/admin' : '/'} className="brand">
          {inAdmin ? 'Stall Booking · Admin' : 'Stall Booking'}
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
              <Link href="/" className={cls('/')}>Events</Link>
              <Link href="/cart" className={cls('/cart')}>
                Cart{cart.length > 0 && <span className="badge-count">{cart.length}</span>}
              </Link>
              {session && <Link href="/bookings" className={cls('/bookings')}>My bookings</Link>}
              {session && <Link href="/profile" className={cls('/profile')}>Profile</Link>}
              {me?.isAdmin && <Link href="/admin">Admin</Link>}
            </>
          )}
          {session ? (
            <button
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
            >
              Log out
            </button>
          ) : (
            <Link href="/login" className={cls('/login')}>Log in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
