/**
 * components/BookingItems.tsx — compact table of a booking's stalls, grouped
 * by event. Shared by vendor and admin booking views.
 */
import { compareStallNo, formatDate, rm } from '@/lib/util';
import type { BookingItem } from '@/lib/types';

export default function BookingItems({ items }: { items: BookingItem[] }) {
  const sorted = [...items].sort(
    (a, b) => a.event_id.localeCompare(b.event_id) || compareStallNo(a.stall_no, b.stall_no),
  );
  return (
    <table>
      <tbody>
        {sorted.map((i) => (
          <tr key={`${i.event_id}/${i.stall_no}`}>
            <td>
              {i.event?.name ?? i.event_id}
              <div className="small muted">{i.event ? formatDate(i.event.event_date) : ''}</div>
            </td>
            <td>Stall {i.stall_no}</td>
            <td className="right">{rm(i.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
