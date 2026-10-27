/**
 * lib/cart.ts — the vendor's booking cart, stored in localStorage.
 *
 * CONCEPT: browsing and picking stalls doesn't reserve anything. Stalls are
 * only held when the vendor checks out (POST /api/bookings), which re-checks
 * availability atomically on the server. The cart is just a wishlist that
 * survives page reloads and spans multiple events.
 *
 * A tiny pub/sub lets every component showing the cart (map, cart bar,
 * header badge) re-render when it changes.
 */
'use client';

import { useEffect, useState } from 'react';
import type { CartItem } from './types';

// v2: lines carry start_date/end_date (v1 had a single event_date).
const KEY = 'stall_cart_v2';
const listeners = new Set<() => void>();

/** Read the cart; storage can throw in private mode, so fall back to empty. */
export function getCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartItem[];
  } catch {
    return [];
  }
}

/** Replace the cart and notify subscribers. */
export function setCart(items: CartItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — cart just won't persist */
  }
  listeners.forEach((fn) => fn());
}

/** Same stall in the same event = same cart line. */
const same = (a: Pick<CartItem, 'event_id' | 'stall_no'>, b: Pick<CartItem, 'event_id' | 'stall_no'>) =>
  a.event_id === b.event_id && a.stall_no === b.stall_no;

/** Add the stall if it's not in the cart, remove it if it is. */
export function toggleCartItem(item: CartItem): void {
  const cart = getCart();
  setCart(cart.some((c) => same(c, item)) ? cart.filter((c) => !same(c, item)) : [...cart, item]);
}

/** Remove specific lines (e.g. ones the server reported as taken). */
export function removeCartItems(items: Pick<CartItem, 'event_id' | 'stall_no'>[]): void {
  setCart(getCart().filter((c) => !items.some((i) => same(c, i))));
}

/** React hook: current cart contents, live-updating. */
export function useCart(): CartItem[] {
  const [cart, setState] = useState<CartItem[]>([]);
  useEffect(() => {
    const update = () => setState(getCart());
    update();
    listeners.add(update);
    // Keep multiple open tabs in sync too.
    window.addEventListener('storage', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return cart;
}
