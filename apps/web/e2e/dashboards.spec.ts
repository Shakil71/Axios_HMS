import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Runs against the API in DEMO_MODE (in-memory database, seeded demo world). */
const PASSWORD = process.env.E2E_DEMO_ACCESS_PASSWORD ?? 'Demo-Access-2026';

const ROLES = [
  { key: 'Super admin', label: /^Super admin/, home: '/admin', heading: 'Overview' },
  { key: 'Medical coordinator', label: /^Medical coordinator/, home: '/staff', heading: /Good (morning|afternoon|evening)/ },
  { key: 'Doctor', label: /^Doctor/, home: '/doctor', heading: /Good (morning|afternoon|evening)/ },
  { key: 'Patient', label: /^Patient/, home: '/patient/dashboard', heading: /^Hello/ },
] as const;

async function signInAs(page: Page, label: RegExp, home: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByLabel('Password')).toHaveValue(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${home}`);
}

test.describe('demo accounts and role-based landing', () => {
  test('login page lists every demo role and the shared password', async ({ page }) => {
    await page.goto('/login');
    const panel = page.getByRole('region', { name: 'Demo accounts' });
    await expect(panel).toBeVisible();
    for (const r of ['Super admin', 'Admin', 'Medical coordinator', 'Case manager', 'Visa officer', 'Travel coordinator', 'Finance', 'Doctor', 'Patient']) {
      await expect(panel.getByRole('button', { name: new RegExp(`^${r}`) }).first()).toBeVisible();
    }
    await expect(panel.getByText(PASSWORD)).toBeVisible();
  });

  for (const r of ROLES) {
    test(`${r.key} lands on ${r.home}, sees data, and passes accessibility checks`, async ({ page }) => {
      await signInAs(page, r.label, r.home);
      await expect(page.getByRole('heading', { level: 1, name: r.heading })).toBeVisible();
      await expect(page.getByRole('navigation', { name: /navigation|^Portal$/ }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
});

test.describe('access boundaries', () => {
  test('a patient cannot open the admin or staff consoles', async ({ page }) => {
    await signInAs(page, /^Patient/, '/patient/dashboard');
    await page.goto('/admin');
    await expect(page.getByText('This area is not part of your account')).toBeVisible();
    await page.goto('/staff/cases');
    await expect(page.getByText('This area is not part of your account')).toBeVisible();
  });

  test('a coordinator without the permission is told so instead of seeing broken pages', async ({ page }) => {
    await signInAs(page, /^Medical coordinator/, '/staff');
    await page.goto('/staff/visa');
    await expect(page.getByRole('heading', { name: /Visa is not part of your role/ })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByText('This area is not part of your account')).toBeVisible();
  });

  test('a staff member without a session is sent to sign in', async ({ page }) => {
    await page.goto('/admin/cases');
    await page.waitForURL(/\/login\?next=%2Fadmin%2Fcases/);
  });
});

test.describe('admin console', () => {
  test('cases list opens a case with tabs; roles and audit screens load', async ({ page }) => {
    await signInAs(page, /^Super admin/, '/admin');
    await page.getByRole('link', { name: 'Cases', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cases' })).toBeVisible();
    await page.locator('table').getByText(/MC-2026-/).first().click();
    await expect(page.getByRole('tab', { name: 'Documents' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: 'Notes & history' }).click();
    await page.goto('/admin/roles');
    await expect(page.getByRole('heading', { level: 1, name: 'Roles & access' })).toBeVisible();
    await expect(page.getByText(/of \d+ permissions enabled/)).toBeVisible();
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { level: 1, name: /Audit/ })).toBeVisible();
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { level: 1, name: /Reports/ })).toBeVisible();
  });
});

test.describe('patient portal', () => {
  test('requests an appointment and sees invoices, visa and travel', async ({ page }) => {
    await signInAs(page, /^Patient/, '/patient/dashboard');
    await page.goto('/patient/appointments');
    await page.getByRole('button', { name: 'Request appointment' }).click();
    await page.getByLabel('Anything we should know?').fill('End-to-end test request');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request sent. Your coordinator will confirm the time with you.')).toBeVisible();
    await expect(page.getByText('Requested').first()).toBeVisible();

    await page.goto('/patient/payments');
    await expect(page.getByRole('heading', { level: 1, name: 'Payments' })).toBeVisible();
    await expect(page.getByText(/INV-/).first()).toBeVisible();
    await page.goto('/patient/visa');
    await expect(page.getByText('Document checklist')).toBeVisible();
    await page.goto('/patient/travel');
    await expect(page.getByText('Flights')).toBeVisible();
  });
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const r of ROLES) {
    test(`${r.key} home has no horizontal scrolling on a phone`, async ({ page }) => {
      await signInAs(page, r.label, r.home);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: /menu/i }).first().click();
      await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    });
  }
});
