'use client';

import { useState } from 'react';
import { HomeIcon } from './icons';

interface Opt { slug: string; name: string }
type Tab = 'doctors' | 'hospitals' | 'treatments';

const TABS: { id: Tab; label: string; action: string }[] = [
  { id: 'doctors', label: 'Doctors', action: '/doctors' },
  { id: 'hospitals', label: 'Hospitals', action: '/hospitals' },
  { id: 'treatments', label: 'Treatments', action: '/treatments' },
];

const selectCls = 'block w-full min-h-12 rounded-lg border border-ink-300 bg-white px-3 text-base text-ink-900 focus:border-brand-600 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600';

/** Search that deep-links into the directory filters. Plain GET forms, so it also works without JavaScript (first tab). */
export function HeroSearch({ countries, specialties, categories }: { countries: Opt[]; specialties: Opt[]; categories: Opt[] }) {
  const [tab, setTab] = useState<Tab>('doctors');
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3 shadow-pop sm:p-4">
      <div role="tablist" aria-label="What would you like to find?" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`hs-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="hs-panel"
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-white text-brand-800 shadow-card' : 'text-ink-700 hover:text-ink-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form method="get" action={current.action} id="hs-panel" role="tabpanel" aria-labelledby={`hs-tab-${tab}`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end" key={tab}>
        {tab === 'treatments' ? (
          <>
            <div>
              <label htmlFor="hs-category" className={labelCls}>Type of care</label>
              <select id="hs-category" name="category" defaultValue="" className={selectCls}>
                <option value="">All types of care</option>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="hs-q" className={labelCls}>Treatment name</label>
              <input id="hs-q" name="q" type="search" placeholder="e.g. knee replacement" className={selectCls} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="hs-specialty" className={labelCls}>Specialty</label>
              <select id="hs-specialty" name="specialty" defaultValue="" className={selectCls}>
                <option value="">Any specialty</option>
                {specialties.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="hs-country" className={labelCls}>Country</label>
              <select id="hs-country" name="country" defaultValue="" className={selectCls}>
                <option value="">Any country</option>
                {countries.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </>
        )}
        <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-700 px-6 text-base font-semibold text-white hover:bg-brand-800 sm:col-span-2 lg:col-span-1">
          <HomeIcon name="search" className="size-5" />
          Search
        </button>
      </form>
    </div>
  );
}
