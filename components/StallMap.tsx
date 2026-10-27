/**
 * components/StallMap.tsx — the clickable floor plan ("cinema seat" picker).
 *
 * CONCEPT: the map is an SVG drawn in the same pixel space as the original
 * layout image (layouts.width × layouts.height). Grey blocks are the shops
 * and escalators; each stall is a clickable rectangle whose colour comes
 * from a `colour()` function the parent page supplies. That way the same
 * component serves:
 *   - vendors: available / in cart / mine / taken
 *   - admins:  available / held / booked / blocked / selected for editing
 * The parent decides what a click means (add to cart vs. select for editing).
 */
'use client';

import type { Layout, MapStall } from '@/lib/types';

export interface StallLook {
  fill: string;
  text: string;
  /** Not clickable (e.g. already taken, for vendors). */
  disabled?: boolean;
  /** Draw a thick outline (e.g. selected). */
  outline?: string;
  /** Diagonal hatch to show "not offered this event". */
  hatched?: boolean;
}

interface Props {
  layout: Layout;
  stalls: MapStall[];
  look: (stall: MapStall) => StallLook;
  onStallClick: (stall: MapStall) => void;
  /** Hover tooltip text per stall. */
  tooltip?: (stall: MapStall) => string;
}

export default function StallMap({ layout, stalls, look, onStallClick, tooltip }: Props) {
  return (
    <div className="map-scroll">
      <svg
        className="map-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label="Stall map"
      >
        {/* Hatch pattern used for blocked stalls */}
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#bdb9b0" strokeWidth="3" />
          </pattern>
        </defs>

        {/* Non-bookable shapes: shop lots, escalators */}
        {layout.blocks.map((b, i) => (
          <g key={`b${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--block-fill)" />
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fill="var(--block-text)"
            >
              {b.label}
            </text>
          </g>
        ))}

        {/* Stalls */}
        {stalls.map((s) => {
          const l = look(s);
          // Stalls are drawn larger than their fill rect would suggest so the
          // tap target is generous; label is centred.
          return (
            <g
              key={s.stall_no}
              className={`stall${l.disabled ? ' disabled' : ''}`}
              onClick={() => !l.disabled && onStallClick(s)}
              role="button"
              tabIndex={l.disabled ? -1 : 0}
              aria-label={`Stall ${s.stall_no}`}
              aria-disabled={l.disabled}
              onKeyDown={(e) => {
                if (!l.disabled && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onStallClick(s);
                }
              }}
            >
              {tooltip && <title>{tooltip(s)}</title>}
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={3}
                fill={l.fill}
                stroke={l.outline ?? 'var(--stall-available-edge)'}
                strokeWidth={l.outline ? 4 : 1}
              />
              {l.hatched && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill="url(#hatch)" />}
              <text
                x={s.x + s.w / 2}
                y={s.y + s.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight={600}
                fill={l.text}
                pointerEvents="none"
              >
                {s.stall_no}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Small colour key shown under the map. */
export function Legend({ items }: { items: { label: string; color: string; hatched?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i
            className="swatch"
            style={{
              background: i.hatched
                ? `repeating-linear-gradient(45deg, ${i.color}, ${i.color} 3px, #bdb9b0 3px, #bdb9b0 5px)`
                : i.color,
            }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
