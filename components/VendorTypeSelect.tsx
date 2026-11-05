/**
 * components/VendorTypeSelect.tsx — vendor type dropdown with an
 * "Other (type your own)…" option.
 *
 * CONCEPT: the parent stores two values:
 *   typeId    – the chosen existing type (or null)
 *   typedName – null normally; a string while "Other" is chosen, holding
 *               what the user typed
 * The server turns a typed name into a real type (reusing an existing one
 * if the name matches, ignoring capitals), so it then shows up in
 * everyone's dropdown.
 */
'use client';

import { useVendorTypes } from './useVendorTypes';

const OTHER = '__other';

export default function VendorTypeSelect({
  typeId,
  typedName,
  onChange,
  placeholder = 'Choose…',
}: {
  typeId: number | null;
  typedName: string | null;
  onChange: (typeId: number | null, typedName: string | null) => void;
  placeholder?: string;
}) {
  const types = useVendorTypes();
  const value = typedName !== null ? OTHER : typeId ?? '';

  return (
    <div className="stack" style={{ marginTop: 0 }}>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) onChange(null, ''); // show the text box
          else onChange(v ? Number(v) : null, null);
        }}
      >
        <option value="">{placeholder}</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
        <option value={OTHER}>Other (type your own)…</option>
      </select>
      {typedName !== null && (
        <input
          autoFocus
          required
          maxLength={40}
          placeholder="e.g. Food & Beverage"
          value={typedName}
          onChange={(e) => onChange(null, e.target.value)}
        />
      )}
    </div>
  );
}
