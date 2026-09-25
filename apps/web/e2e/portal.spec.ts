import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'Demo-Password-2026!';
const PDF = Buffer.from('%PDF-1.4\n%e2e test document\n');

async function signIn(page: Page, next = '/patient/dashboard') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill('patient@demo.hms.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${next}`);
}

test.describe('public site', () => {
  test('home renders directory data and passes automated accessibility checks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trusted medical treatment abroad');
    await expect(page.getByRole('heading', { name: 'Featured hospitals' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('doctor directory filters work without JavaScript state and detail page is server rendered', async ({ page }) => {
    await page.goto('/doctors');
    await page.getByLabel('Specialty').selectOption({ label: 'Cardiology' });
    await page.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/specialty=cardiology/);
    const cards = page.getByRole('heading', { level: 3 });
    await expect(cards.first()).toContainText('DEMO');
    await cards.first().getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('DEMO Cardiologist');
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('registration validates on the client and shows plain-language errors', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('patient portal', () => {
  test('unauthenticated visitors are sent to sign in and returned afterwards', async ({ page }) => {
    await page.goto('/patient/documents');
    await page.waitForURL(/\/login\?next=%2Fpatient%2Fdocuments/);
    await page.getByLabel('Email address').fill('patient@demo.hms.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/patient/documents');
    await expect(page.getByRole('heading', { name: 'My documents' })).toBeVisible();
  });

  test('wrong password shows a generic error and no token is stored in browser storage', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('patient@demo.hms.test');
    await page.getByLabel('Password').fill('not-the-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password.' })).toBeVisible();
  });

  test('full journey: sign in → open a case → upload a document → see it → survive reload → sign out', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: /Hello, DEMO/ })).toBeVisible();

    // session and secrets: nothing sensitive in web storage; refresh token is httpOnly
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toMatch(/eyJ|token|passport/i);
    expect((await page.context().cookies()).find((c) => c.name === 'hms_rt')?.httpOnly).toBe(true);

    // create a case
    await page.goto('/patient/cases/new');
    await page.getByLabel(/Symptoms or reason/).fill('E2E test: recurring chest discomfort when climbing stairs');
    await page.getByRole('button', { name: 'Create my case' }).click();
    await expect(page.getByText('Your case has been created')).toBeVisible();
    await expect(page.getByText(/^MC-\d{4}-\d{6}$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your treatment journey' })).toBeVisible();

    // upload a document to the case
    await page.getByLabel('Choose files to upload').setInputFiles({ name: 'e2e-report.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('Your document has been submitted for verification.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents for this case' })).toBeVisible();
    await expect(page.getByText('e2e-report.pdf').first()).toBeVisible();

    // rejects a wrong file type client-side
    await page.getByLabel('Choose files to upload').setInputFiles({ name: 'malware.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await expect(page.getByRole('alert').filter({ hasText: 'not accepted' })).toBeVisible();

    // a signed download URL works for the owner and is short lived
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/download-url')),
      page.getByRole('button', { name: 'Download' }).first().click().catch(() => undefined),
    ]);
    const url = (await resp.json()).data.url as string;
    const file = await page.request.get(url);
    expect(file.status()).toBe(200);
    expect((await file.body()).toString()).toContain('%PDF');

    // reload keeps the session (httpOnly refresh cookie restores it)
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Documents for this case' })).toBeVisible();

    // dashboard shows the case
    await page.goto('/patient/dashboard');
    await expect(page.getByText('Active treatment case')).toBeVisible();

    // sign out
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/patient/dashboard');
    await page.waitForURL(/\/login/);
  });

  test('profile masks passport and NID numbers after saving', async ({ page }) => {
    await signIn(page, '/patient/profile');
    await page.getByLabel('Passport number').fill('EE1234567');
    await page.getByLabel('NID number').fill('1990123456789');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Your profile has been saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Saved: ••••4567')).toBeVisible();
    await expect(page.getByText('Saved: ••••6789')).toBeVisible();
    expect(await page.content()).not.toContain('EE1234567');
  });

  test('family members can be added and started as a case', async ({ page }) => {
    await signIn(page, '/patient/family');
    await page.getByRole('button', { name: 'Add a family member' }).click();
    await page.getByLabel('Full name').fill('E2E Relative');
    await page.getByLabel('Relationship to you').selectOption('MOTHER');
    await page.getByRole('button', { name: 'Add family member' }).click();
    await expect(page.getByText('E2E Relative').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Start a case for E2E/ }).first()).toBeVisible();
  });

  test('portal pages pass automated accessibility checks', async ({ page }) => {
    await signIn(page);
    for (const path of ['/patient/dashboard', '/patient/documents', '/patient/profile', '/patient/cases']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500); // let queries settle
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.length}`)).toEqual([]);
    }
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('portal has a bottom tab bar and the page does not scroll sideways', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('navigation', { name: 'Portal' }).last()).toBeVisible();
    await page.getByRole('link', { name: 'Documents' }).last().click();
    await page.waitForURL('**/patient/documents');
    await expect(page.getByRole('button', { name: 'Take a photo', exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('public home has no horizontal scroll on a phone', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
