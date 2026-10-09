/// <reference lib="dom" />
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { createTestApp } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { startNodeAppServer, closeNodeServer } from '@nocobase/app-server/node';
import { createStandaloneServer } from '../../server/standalone.js';

// This fixture signs in only to its disposable application using the framework's
// test account. No personal login, persisted cookies, traces or production data.
const origin = 'http://localhost:14172';
const screenshots = 'storage/ui-workflow/customers/screenshots';
let app: Awaited<ReturnType<typeof createTestApp>>;
let http: Awaited<ReturnType<typeof startNodeAppServer>>;
let base: string;

test.beforeAll(async () => {
  await mkdir(screenshots, { recursive: true });
  app = await createTestApp({
    createServer: createStandaloneServer,
    config: {
      auth: { baseURL: origin, trustedOrigins: [origin] },
      i18n: { defaultLocale: 'en-US' },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    },
  });
  base = `${origin}${app.publicBasePath.replace(/\/$/, '')}`;
  http = await startNodeAppServer(app.server, {
    hostname: '127.0.0.1',
    port: 14172,
    registerProcessSignals: false,
  });
});

test.afterAll(async () => {
  if (http) await closeNodeServer(http);
  if (app) await app.close();
});

async function select(page: Page, label: string, option: string) {
  await page
    .getByRole('combobox', { name: label, exact: true })
    .and(page.locator(':not([inert] *)'))
    .click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function ime(page: Page, input: Locator, result: string) {
  await input.focus();
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const text of ['x', 'xi', 'xing', 'xinghe']) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    }
    await cdp.send('Input.insertText', { text: result });
  } finally {
    await cdp.detach();
  }
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(screenshots, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

test('customer create/edit, combination filters, multiple contacts, IME, focus and responsive themes', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedRequests.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  const login = await context.request.post(
    `${base}/api/auth/sign-in/username`,
    {
      data: DEFAULT_ADMIN_CREDENTIALS,
      headers: { origin },
    },
  );
  expect(login.status()).toBe(200);
  // Learn the actual operations from the running application's document.
  const apiDocument = await (
    await context.request.get(`${base}/api/swagger`)
  ).json();
  expect(apiDocument.paths['/api/customers'].post.operationId).toBe(
    'createCustomer',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await shot(page, 'baseline');
  await page.goto(`${base}/customers`);
  await expect(
    page.getByText('No customers yet', { exact: true }),
  ).toBeVisible();
  await shot(page, 'empty');
  await page.getByRole('button', { name: 'New customer', exact: true }).click();
  const company = page.getByLabel(/Company name/);
  await company.pressSequentially('Demo ');
  await ime(page, company, '星河');
  await expect(company).toHaveValue('Demo 星河');
  await company.press('Home');
  await company.pressSequentially('A');
  await expect(company).toHaveValue('ADemo 星河');
  await select(page, 'Status', 'Active');
  await select(page, 'Grade', 'A');
  await page
    .getByLabel('Industry', { exact: true })
    .pressSequentially('Manufacturing');
  await page
    .getByLabel('Notes', { exact: true })
    .fill('Acceptance fixture only.\n' + 'Long note '.repeat(30));
  await shot(page, 'customer-form');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'ADemo 星河', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Search company names' }),
  ).toBeFocused();

  // A second owner and contrasting customer make every filter selective.
  const signup = await context.request.post(`${base}/api/auth/sign-up/email`, {
    data: {
      name: 'Test Operator',
      email: 'browser@example.test',
      password: 'Test-only-passphrase-123',
    },
    headers: { origin },
  });
  expect(signup.status()).toBe(200);
  await context.request.post(`${base}/api/auth/sign-in/username`, {
    data: DEFAULT_ADMIN_CREDENTIALS,
    headers: { origin },
  });
  const owners = await (
    await context.request.get(`${base}/api/customerOwners`)
  ).json();
  const operator = owners.data.find(
    (o: { name: string }) => o.name === 'Test Operator',
  );
  expect(operator).toBeTruthy();
  const contrast = await context.request.post(`${base}/api/customers`, {
    data: {
      companyName: 'Other customer',
      ownerId: operator.id,
      status: 'lost',
      grade: 'B',
    },
    headers: { origin },
  });
  expect(contrast.status()).toBe(201);
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Other customer', exact: true }),
  ).toBeVisible();
  await select(
    page,
    'Owner',
    owners.data.find((o: { id: string }) => o.id !== operator.id).name,
  );
  await select(page, 'Status', 'Active');
  await select(page, 'Grade', 'A');
  await expect(
    page.getByRole('link', { name: 'Other customer', exact: true }),
  ).toHaveCount(0);
  const search = page.getByRole('textbox', { name: 'Search company names' });
  await ime(page, search, '星河');
  await expect(page).toHaveURL(/q=%E6%98%9F%E6%B2%B3/);
  await expect(search).toHaveValue('星河');
  await expect(search).toBeFocused();
  await shot(page, 'filtered-list');
  const filtered = page.url();
  await page.getByRole('link', { name: 'ADemo 星河', exact: true }).click();
  await expect(
    page.getByText('No contacts yet', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit', exact: true })
    .and(page.locator(':not([inert] *)'))
    .click();
  await expect(page.getByLabel(/Company name/)).toHaveValue('ADemo 星河');
  await page
    .getByLabel('Industry', { exact: true })
    .fill('Manufacturing updated');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .getByText('Manufacturing updated', { exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Edit', exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeFocused();
  for (const name of ['Test Contact One 星河', 'Test Contact Two']) {
    await page
      .getByRole('button', { name: 'New contact', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'New contact' }),
    ).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toBeFocused();
    if (name.endsWith('星河')) {
      await page.getByLabel(/^Name/).pressSequentially('Test Contact One ');
      await ime(page, page.getByLabel(/^Name/), '星河');
      await expect(page.getByLabel(/^Name/)).toHaveValue(name);
    } else await page.getByLabel(/^Name/).pressSequentially(name);
    await page
      .getByLabel('Phone', { exact: true })
      .pressSequentially('+86 021 00123 ext 8');
    await page.getByLabel('Email', { exact: true }).fill('bad');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await page
      .getByLabel('Email', { exact: true })
      .fill('contact@example.test');
    await shot(
      page,
      name.endsWith('星河') ? 'contact-form' : 'contact-form-second',
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'New contact', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  const contactRow = page
    .getByRole('row')
    .filter({ hasText: 'Test Contact One' });
  await contactRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(
    '+86 021 00123 ext 8',
  );
  await page.getByLabel('Position', { exact: true }).fill('Purchasing');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Purchasing', { exact: true })).toBeVisible();
  await shot(page, 'detail');

  // Verify Escape and actual focus restoration, independent of screenshots.
  await page.getByRole('button', { name: 'New contact', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'New contact', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'New contact', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'New contact', exact: true }),
  ).toBeFocused();

  for (const preset of ['compact', 'default']) {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(
        ({ preset, mode, basePath }) => {
          const scope = basePath.replace(/^\/+|\/+$/g, '') || '%2F';
          localStorage.setItem(`nocobase:${scope}:theme:color-scheme`, mode);
          localStorage.setItem(`nocobase:${scope}:theme:preset`, preset);
        },
        { preset, mode, basePath: app.publicBasePath },
      );
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', preset);
      await expect(page.locator('html')).toHaveClass(new RegExp(mode));
      await expect(
        page.getByText('Test Contact Two', { exact: true }),
      ).toBeVisible();
      await shot(page, `detail-${preset}-${mode}`);
      await page.setViewportSize({ width: 375, height: 812 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
      await shot(page, `detail-${preset}-${mode}-375`);
      await page
        .getByRole('button', { name: 'New contact', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'New contact',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      await expect(
        dialog.getByRole('button', { name: 'Create', exact: true }),
      ).toBeInViewport();
      await shot(page, `dialog-${preset}-${mode}-375`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(filtered);
  await expect(page.locator('[data-slot="route-child-page"]')).toHaveCount(0);
  await expect(search).toBeFocused();
  await search.fill('no such company');
  await expect(
    page.getByText('No matching customers', { exact: true }),
  ).toBeVisible();
  await shot(page, 'no-results');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('link', { name: 'Other customer', exact: true }),
  ).toBeVisible();
  // Use the application's language control, verifying real translated UI.
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '客户', exact: true }),
  ).toBeVisible();
  await shot(page, 'list-zh');
  await page.setViewportSize({ width: 375, height: 812 });
  await shot(page, 'list-zh-375');
  await page.getByRole('button', { name: '新建客户', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '新建客户', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#customer-companyName')).toBeVisible();
  await shot(page, 'customer-form-zh-375');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await writeFile(
    path.join(screenshots, 'capture-log.json'),
    JSON.stringify(
      {
        browser: page.context().browser()?.version(),
        errors,
        consoleErrors,
        failedRequests,
        fixture:
          'isolated SQLite and framework test users; destroyed on teardown',
        ime: 'CDP composition; OS candidate window not exercised',
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('loading and recoverable errors; forbidden and missing records do not offer retry', async ({
  page,
  context,
}) => {
  await context.request.post(`${base}/api/auth/sign-in/username`, {
    data: DEFAULT_ADMIN_CREDENTIALS,
    headers: { origin },
  });
  const doc = await (await context.request.get(`${base}/api/swagger`)).json();
  expect(doc.paths['/api/customers'].post.operationId).toBe('createCustomer');
  expect(
    (
      await context.request.post(`${base}/api/customers`, {
        data: { companyName: 'Recovery customer' },
        headers: { origin },
      })
    ).status(),
  ).toBe(201);
  const endpoint = `${base}/api/customers*`;
  let release: () => void = () => undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await paused;
    await route.continue();
  });
  await page.goto(`${base}/customers`);
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
  await shot(page, 'loading');
  release();
  await expect(
    page.getByRole('link', { name: 'Recovery customer', exact: true }),
  ).toBeVisible();
  await page.unroute(endpoint);
  for (const status of [500, 403, 404]) {
    await page.route(endpoint, (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Acceptance fixture' } }),
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    if (status === 500)
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    else
      await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await shot(page, `error-${status}`);
    await page.unroute(endpoint);
  }
  await page.route(endpoint, (route) => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await shot(page, 'error-network');
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'Recovery customer', exact: true }),
  ).toBeVisible();
});
