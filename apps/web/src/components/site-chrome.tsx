import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';
import { Container, LinkButton, Logo } from './ui';

const NAV = [
  { href: '/countries', label: 'Countries' },
  { href: '/hospitals', label: 'Hospitals' },
  { href: '/doctors', label: 'Doctors' },
  { href: '/treatments', label: 'Treatments' },
  { href: '/services', label: 'Services' },
  { href: '/visa-assistance', label: 'Visa help' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-bold text-ink-900">
          <Logo />
          <span className="text-base sm:text-lg">{SITE_NAME}</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 hover:text-brand-800">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 whitespace-nowrap lg:flex">
          <LinkButton href="/login" variant="ghost">Sign in</LinkButton>
          <LinkButton href="/register">Get consultation</LinkButton>
        </div>

        {/* Zero-JS mobile menu */}
        <details className="group relative lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-ink-300 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Menu
          </summary>
          <nav aria-label="Mobile" className="absolute right-0 mt-2 w-64 rounded-xl border border-ink-200 bg-white p-2 shadow-pop">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-3 text-ink-800 hover:bg-ink-50">{n.label}</Link>
            ))}
            <div className="mt-2 grid gap-2 border-t border-ink-100 pt-3">
              <LinkButton href="/register">Get consultation</LinkButton>
              <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
            </div>
          </nav>
        </details>
      </Container>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: Record<string, string> }) {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-50">
      <Container className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-bold text-ink-900">{SITE_NAME}</p>
          <p className="mt-2 text-sm text-ink-600">
            We help patients from Bangladesh arrange treatment abroad: doctors, hospitals, appointments, visa documents and travel.
          </p>
        </div>
        <FooterCol title="Explore" links={[['/countries', 'Countries'], ['/hospitals', 'Hospitals'], ['/doctors', 'Doctors'], ['/treatments', 'Treatments']]} />
        <FooterCol title="Help" links={[['/services', 'Our services'], ['/visa-assistance', 'Visa help'], ['/faq', 'Questions & answers'], ['/contact', 'Contact us']]} />
        <div>
          <p className="text-sm font-semibold text-ink-900">Contact</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
            {settings['contact.phone'] && <li>{settings['contact.phone']}</li>}
            {settings['contact.email'] && <li><a href={`mailto:${settings['contact.email']}`}>{settings['contact.email']}</a></li>}
            {settings['office.dhaka.address'] && <li>{settings['office.dhaka.address']}</li>}
          </ul>
        </div>
      </Container>
      <div className="border-t border-ink-200">
        <Container className="flex flex-col gap-2 py-5 text-xs text-ink-500 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
          <p>We coordinate care and paperwork. We do not give medical advice or guarantee medical or visa outcomes.</p>
        </Container>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}><Link href={href} className="text-ink-600 hover:text-brand-700">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
