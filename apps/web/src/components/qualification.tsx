import type { QualificationField } from '@clinical-crm/core';

function fmtValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function labelForKey(key: string): string {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Renders a `qualification` jsonb blob as labeled key-value rows, using the
 * vertical pack's qualificationFields for labels (falls back to the raw key
 * for anything the pack doesn't know about). Returns null when empty.
 */
export function QualificationList({
  qualification,
  fields,
}: {
  qualification: Record<string, unknown> | null | undefined;
  fields: QualificationField[];
}) {
  const entries = Object.entries(qualification ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;

  const labelByKey = new Map(fields.map((f) => [f.key, f.label]));
  // pack-defined fields first, in pack order; unknown keys after
  const known = fields
    .map((f) => entries.find(([k]) => k === f.key))
    .filter((e): e is [string, unknown] => !!e);
  const unknown = entries.filter(([k]) => !labelByKey.has(k));

  return (
    <dl className="space-y-2 text-sm">
      {[...known, ...unknown].map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <dt className="text-slate-500">{labelByKey.get(key) ?? labelForKey(key)}</dt>
          <dd className="text-right text-slate-800">{fmtValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function hasQualification(q: Record<string, unknown> | null | undefined): boolean {
  return Object.values(q ?? {}).some((v) => v !== null && v !== undefined && v !== '');
}
