import Link from 'next/link';
import { Button, Input, Select } from './ui';

export interface FilterField {
  name: string;
  label: string;
  type: 'select' | 'search' | 'number';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

/** Plain GET form: filters live in the URL (shareable, crawlable) and need no client JavaScript. */
export function FilterForm({ action, fields, values }: { action: string; fields: FilterField[]; values: Record<string, string | undefined> }) {
  const active = fields.some((f) => values[f.name]);
  return (
    <form method="get" action={action} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card" role="search" aria-label="Filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`f-${f.name}`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">{f.label}</label>
            {f.type === 'select' ? (
              <Select id={`f-${f.name}`} name={f.name} defaultValue={values[f.name] ?? ''}>
                <option value="">Any</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : (
              <Input id={`f-${f.name}`} name={f.name} type={f.type === 'number' ? 'number' : 'search'} min={f.type === 'number' ? 0 : undefined} defaultValue={values[f.name] ?? ''} placeholder={f.placeholder} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit">Show results</Button>
        {active && <Link href={action} className="text-sm font-medium">Clear filters</Link>}
      </div>
    </form>
  );
}
