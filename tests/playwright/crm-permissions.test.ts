/// <reference lib="dom" />
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { createTestApp } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { startNodeAppServer, closeNodeServer } from '@nocobase/app-server/node';
import { createStandaloneServer } from '../../server/standalone.js';

const origin = 'http://localhost:14176';
const screenshots = 'storage/ui-workflow/crm-teams/screenshots';
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
    port: 14176,
    registerProcessSignals: false,
  });
});
test.afterAll(async () => {
  if (http) await closeNodeServer(http);
  if (app) await app.close();
});
async function select(page: Page, label: string, option: string, index = 0) {
  await page
    .getByRole('combobox', { name: label, exact: true })
    .nth(index)
    .click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `${screenshots}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

// All identities, passwords and business records below belong to this disposable fixture.
// This automated browser check does not replace Super Admin's target-app acceptance.
test('admin team configuration, ordinary sales login, manager transfer, scope errors and responsive themes', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  expect(
    (
      await context.request.post(`${base}/api/auth/sign-in/username`, {
        data: DEFAULT_ADMIN_CREDENTIALS,
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  const document = await (
    await context.request.get(`${base}/api/swagger`)
  ).json();
  expect(document.paths['/api/crmTeams'].post.operationId).toBe(
    'createCrmTeam',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await shot(page, 'baseline');
  await page.goto(`${base}/settings/crm-teams`);
  await expect(
    page.getByRole('heading', { name: 'Sales teams', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Create a team first, then assign members here.'),
  ).toBeVisible();
  await shot(page, 'teams-empty');
  const name = page.getByLabel('Name *');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(name).toBeFocused();
  await name.pressSequentially('Fixture ');
  const cdp = await context.newCDPSession(page);
  for (const text of ['x', 'xi', 'xing'])
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  await cdp.send('Input.insertText', { text: '星河' });
  await cdp.detach();
  await expect(name).toHaveValue('Fixture 星河');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Saved "Fixture 星河"', { exact: true }),
  ).toBeVisible();
  const teamsResponse = await (
    await context.request.get(`${base}/api/crmTeams`)
  ).json();
  const t1 = teamsResponse.data[0];
  await select(page, 'Team', 'New team');
  await name.pressSequentially('Fixture Other');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Saved "Fixture Other"', { exact: true }),
  ).toBeVisible();
  const teams = (
    await (await context.request.get(`${base}/api/crmTeams`)).json()
  ).data;
  const t2 = teams.find((team: { id: string }) => team.id !== t1.id);
  const users = app.application.container.resolve(
    userAdministrationServiceToken,
  );
  const authz = app.application.container.resolve(authorizationToken);
  const password = 'Fixture-only-passphrase-123';
  const a = await users.create({
    name: 'Fictitious Sales A',
    email: 'a@example.test',
    password,
  });
  const b = await users.create({
    name: 'Fictitious Sales B',
    email: 'b@example.test',
    password,
  });
  const c = await users.create({
    name: 'Fictitious Sales C',
    email: 'c@example.test',
    password,
  });
  const m = await users.create({
    name: 'Fictitious Manager',
    email: 'm@example.test',
    password,
  });
  for (const user of [a, b, c, m]) {
    await authz.permissionSets.assign({
      permissionSet: user.id === m.id ? 'crm.salesManager' : 'crm.sales',
      subject: { type: 'user', id: user.id },
    });
    expect(
      (
        await context.request.put(`${base}/api/crmTeamMembers/${user.id}`, {
          data: {
            teamId: user.id === c.id ? t2.id : t1.id,
            active: true,
            isManager: user.id === m.id,
            version: 0,
          },
        })
      ).status(),
    ).toBe(200);
  }
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await select(page, 'User', a.name);
  await expect(
    page.getByText(
      'Affected customers: 0. Contacts follow the customer scope.',
    ),
  ).toBeVisible();
  await shot(page, 'membership');
  for (const mode of ['light', 'dark']) {
    await page.evaluate(
      ({ mode, basePath }) => {
        const scope = basePath.replace(/^\/+|\/+$/g, '') || '%2F';
        localStorage.setItem(`nocobase:${scope}:theme:color-scheme`, mode);
      },
      { mode, basePath: app.publicBasePath },
    );
    await page.reload();
    await expect(page.locator('html')).toHaveClass(new RegExp(mode));
    await select(page, 'User', a.name);
    await shot(page, `teams-${mode}`);
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
    await shot(page, `teams-${mode}-375`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '销售团队', exact: true }),
  ).toBeVisible();
  await shot(page, 'teams-zh');
  await page.setViewportSize({ width: 375, height: 812 });
  await shot(page, 'teams-zh-375');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '打开账户菜单' }).click();
  await page.getByRole('menuitem', { name: /语言/ }).hover();
  await page
    .getByRole('menuitemradio', { name: 'English', exact: true })
    .click();
  const records: Record<string, string> = {};
  for (const user of [a, b, c]) {
    const response = await context.request.post(`${base}/api/customers`, {
      data: { companyName: `${user.name} customer`, ownerId: user.id },
    });
    expect(response.status()).toBe(201);
    records[user.id] = (await response.json()).data.id;
  }
  await context.clearCookies();
  expect(
    (
      await context.request.post(`${base}/api/auth/sign-in/email`, {
        data: { email: a.email, password },
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`${base}/customers`);
  await expect(
    page.getByRole('link', { name: `${a.name} customer`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${b.name} customer`, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Sales teams', exact: true }),
  ).toHaveCount(0);
  await shot(page, 'sales-own');
  expect(
    (
      await context.request.get(`${base}/api/customers/${records[b.id]}`)
    ).status(),
  ).toBe(404);
  await page.goto(`${base}/customers/${records[b.id]}`);
  await expect(
    page.getByText(
      'This record does not exist or has been deleted. Return to the previous page.',
    ),
  ).toBeVisible();
  await shot(page, 'sales-denied');
  await page.goto(`${base}/customers/${records[a.id]}`);
  await expect(
    page.getByRole('button', { name: 'Transfer', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Owner', exact: true }),
  ).toBeDisabled();
  await context.clearCookies();
  expect(
    (
      await context.request.post(`${base}/api/auth/sign-in/email`, {
        data: { email: m.email, password },
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`${base}/customers?search=customer`);
  await expect(
    page.getByRole('link', { name: `${b.name} customer`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${c.name} customer`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: `${b.name} customer`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page).toHaveURL(/transfer\?search=customer/);
  await select(page, 'Owner', a.name);
  await shot(page, 'manager-transfer');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Transfer', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`${records[b.id]}\\?search=customer`),
  );
  expect(
    (
      await context.request.get(`${base}/api/customers/${records[c.id]}`)
    ).status(),
  ).toBe(404);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/customers`);
  await shot(page, 'manager-narrow');
  expect(errors).toEqual([]);
});
