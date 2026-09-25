import { Container, LinkButton } from '@/components/ui';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container className="py-20 text-center">
          <p className="text-sm font-semibold text-brand-700">Error 404</p>
          <h1 className="mt-2 text-3xl font-bold">We could not find that page</h1>
          <p className="mx-auto mt-3 max-w-md text-ink-600">The page may have moved or the link may be incorrect.</p>
          <div className="mt-6 flex justify-center gap-3">
            <LinkButton href="/">Go to the home page</LinkButton>
            <LinkButton href="/doctors" variant="secondary">Find a doctor</LinkButton>
          </div>
        </Container>
      </main>
      <SiteFooter settings={{}} />
    </>
  );
}
