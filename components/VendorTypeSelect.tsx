/**
 * components/VendorTypeSelect.tsx — type-to-search vendor type box.
 *
 * CONCEPT: one text box instead of a dropdown + "Other" option.
 *   - Focus it → the existing types drop down.
 *   - Type → the list narrows to types containing what was typed.
 *   - Pick a suggestion (click / Enter) → that existing type is used.
 *   - Text that matches no type exactly → it's a NEW type, offered as
 *     "+ Add … as a new type" and created by the server when the form is saved.
 * An exact match ignoring capitals/extra spaces ("products") counts as the
 * existing type, so near-duplicates aren't created.
 *
 * The parent still stores two values, as before:
 *   typeId    – an existing type's id (or null)
 *   typedName – a new type's name (or null)
 */
'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useVendorTypes } from './useVendorTypes';

/** Compare names the way the server does: trimmed, single spaces, any case. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export default function VendorTypeSelect({
  typeId,
  typedName,
  onChange,
  placeholder = 'Start typing, e.g. Food, Crafts…',
}: {
  typeId: number | null;
  typedName: string | null;
  onChange: (typeId: number | null, typedName: string | null) => void;
  placeholder?: string;
}) {
  const types = useVendorTypes();
  const listId = useId();
  const [text, setText] = useState(typedName ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted suggestion (keyboard)
  const touched = useRef(false);

  // Show the saved type's name once the type list has loaded (until the
  // user starts editing).
  useEffect(() => {
    if (touched.current) return;
    const t = types.find((x) => x.id === typeId);
    if (t) setText(t.name);
  }, [types, typeId]);

  // Suggestions: types whose name contains the typed text.
  const matches = useMemo(() => {
    const q = norm(text);
    return q ? types.filter((t) => norm(t.name).includes(q)) : types;
  }, [types, text]);
  const exact = types.find((t) => norm(t.name) === norm(text)) ?? null;
  const isNew = !!norm(text) && !exact;

  /** Report the current text to the parent as existing-or-new. */
  function commit(value: string) {
    const hit = types.find((t) => norm(t.name) === norm(value));
    if (hit) onChange(hit.id, null);
    else if (norm(value)) onChange(null, value.trim());
    else onChange(null, null);
  }

  function pick(name: string) {
    touched.current = true;
    setText(name);
    commit(name);
    setOpen(false);
  }

  return (
    <div className="combo">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        maxLength={40}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        // Delay so a click on a suggestion lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          touched.current = true;
          setText(e.target.value);
          commit(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            // Enter picks the highlighted suggestion instead of submitting.
            e.preventDefault();
            pick(matches[active].name);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {/* While the list is open the hint sits inside it; once closed, keep it visible here. */}
      {isNew && !open && <div className="small muted" style={{ marginTop: 4 }}>New type: “{text.trim()}” will be added</div>}
      {open && (matches.length > 0 || isNew) && (
        <ul className="combo-list" id={listId} role="listbox">
          {matches.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              className={`combo-opt${i === active ? ' active' : ''}`}
              // mousedown (not click) so it fires before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t.name);
              }}
            >
              {t.name}
            </li>
          ))}
          {/* Typed text that isn't an existing type: offer it as a new one. */}
          {isNew && (
            <li
              role="option"
              aria-selected={false}
              className="combo-new"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(text.trim());
              }}
            >
              + Add “{text.trim()}” as a new type
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
