import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';
import { HomeIcon } from './home/icons';
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

export function SiteHeader({ settings = {} }: { settings?: Record<string, string> }) {
  const phone = settings['contact.phone'];
  const email = settings['contact.email'];
  return (
    <>
      <div className="hidden bg-brand-900 text-brand-100 lg:block">
        <Container className="flex h-9 items-center justify-between text-xs">
          <p className="flex items-center gap-2">
            <HomeIcon name="shield" className="size-4" />
            Verified doctors and hospitals · Private, secure documents · English and বাংলা support
          </p>
          <p className="flex items-center gap-5">
            {phone && (
              <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-1.5 text-brand-100 no-underline hover:text-white">
                <HomeIcon name="phone" className="size-3.5" />
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-brand-100 no-underline hover:text-white">
                <HomeIcon name="mail" className="size-3.5" />
                {email}
              </a>
            )}
            <Link href="/contact" className="font-semibold text-white no-underline hover:underline">Contact us</Link>
          </p>
        </Container>
      </div>

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
    </>
  );
}

export function SiteFooter({ settings }: { settings: Record<string, string> }) {
  return (
    <footer className="mt-16 bg-brand-900 text-brand-100">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold text-white">
            <Logo />
            {SITE_NAME}
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-100">
            We help patients from Bangladesh arrange treatment abroad: doctors, hospitals, appointments, visa documents and travel.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton href="/register" variant="light">Start your case</LinkButton>
            <LinkButton href="/login" variant="outlineLight">Sign in</LinkButton>
          </div>
        </div>
        <FooterCol title="Explore" links={[['/countries', 'Countries'], ['/hospitals', 'Hospitals'], ['/doctors', 'Doctors'], ['/treatments', 'Treatments']]} />
        <FooterCol title="Help" links={[['/services', 'Our services'], ['/visa-assistance', 'Visa help'], ['/faq', 'Questions & answers'], ['/about', 'About us'], ['/contact', 'Contact us']]} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white">Contact</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {settings['contact.phone'] && (
              <li className="flex items-start gap-2.5"><HomeIcon name="phone" className="mt-0.5 size-4 shrink-0" /><span>{settings['contact.phone']}</span></li>
            )}
            {settings['contact.email'] && (
              <li className="flex items-start gap-2.5"><HomeIcon name="mail" className="mt-0.5 size-4 shrink-0" /><a href={`mailto:${settings['contact.email']}`} className="text-brand-100 hover:text-white">{settings['contact.email']}</a></li>
            )}
            {settings['office.dhaka.address'] && (
              <li className="flex items-start gap-2.5"><HomeIcon name="hospital" className="mt-0.5 size-4 shrink-0" /><span>{settings['office.dhaka.address']}</span></li>
            )}
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/15">
        <Container className="flex flex-col gap-2 py-5 text-xs text-brand-100 sm:flex-row sm:justify-between">
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
      <p className="text-sm font-semibold uppercase tracking-wide text-white">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}><Link href={href} className="text-brand-100 hover:text-white">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
