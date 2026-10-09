// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import { customersResource } from '../../server/providers/crm-resources.js';
import { initializeCrmPermissionSets } from '../../database/main/seeds/202610090001_crm_permission_sets.ts';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { baseURL: 'http://localhost', trustedOrigins: ['http://localhost'] },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
const json = (method: string, body: object): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  body: JSON.stringify(body),
});

test('installs the two jobs once and preserves an administrator edit when initialization is retried', async ({
  testApp,
}) => {
  const authz = testApp.application.container.resolve(authorizationToken);
  const db = testApp.application.container.resolve(databaseManagerToken);
  const sales = await authz.permissionSets.get('crm.sales');
  expect(sales).toBeDefined();
  expect(await authz.permissionSets.get('crm.salesManager')).toBeDefined();
  expect(await authz.permissionSets.listAssignments('crm.sales')).toEqual([]);
  await authz.permissionSets.update('crm.sales', {
    key: 'crm.sales',
    title: 'Administrator-edited sales',
    grants: [],
  });
  await db.transaction((connection) =>
    initializeCrmPermissionSets(connection.query),
  );
  expect(await authz.permissionSets.get('crm.sales')).toMatchObject({
    title: 'Administrator-edited sales',
    grants: [],
  });
  await authz.permissionSets.update('crm.sales', {
    key: sales!.key,
    title: sales!.title,
    grants: sales!.grants,
  });
});

test('enforces ownership, inherited contacts, team boundaries, assignment revocation and account/team changes through real APIs', async ({
  testApp,
  request,
}) => {
  const authz = testApp.application.container.resolve(authorizationToken);
  const users = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const db = testApp.application.container.resolve(databaseManagerToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = async (name: string, set: string) => {
    const email = `${name}@example.test`;
    const password = 'Test-only-passphrase-123';
    const user = await users.create({ name, email, password });
    const assignment = await authz.permissionSets.assign({
      permissionSet: set,
      subject: { type: 'user', id: user.id },
    });
    return {
      user,
      assignment,
      session: await signIn(testApp, { email, password }),
    };
  };
  const a = await actor('sales-a', 'crm.sales');
  const b = await actor('sales-b', 'crm.sales');
  const c = await actor('sales-c', 'crm.sales');
  const m = await actor('manager-m', 'crm.salesManager');
  const n = await actor('manager-n', 'crm.salesManager');
  const createTeam = async (name: string) =>
    (
      await (
        await admin.fetch('/crmTeams', json('POST', { name, active: true }))
      ).json()
    ).data;
  const t1 = await createTeam('Team One');
  const t2 = await createTeam('Team Two');
  const join = async (
    id: string,
    teamId: string,
    isManager = false,
    version = 0,
    confirmImpact = false,
  ) => {
    const response = await admin.fetch(
      `/crmTeamMembers/${id}`,
      json('PUT', { teamId, isManager, active: true, version, confirmImpact }),
    );
    expect(await response.clone().text()).not.toContain('error');
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  const am = await join(a.user.id, t1.id);
  await join(b.user.id, t1.id);
  await join(c.user.id, t2.id);
  const mm = await join(m.user.id, t1.id, true);
  await join(n.user.id, t2.id, true);
  expect((await request('/crmTeams')).status).toBe(401);
  expect((await a.session.fetch('/crmTeams')).status).toBe(403);
  expect((await m.session.fetch('/crmTeamUsers')).status).toBe(403);
  const make = async (ownerId: string) => {
    const response = await admin.fetch(
      '/customers',
      json('POST', { companyName: 'Same fictitious name', ownerId }),
    );
    expect(response.status).toBe(201);
    return (await response.json()).data;
  };
  const ca = await make(a.user.id),
    cb = await make(b.user.id),
    cc = await make(c.user.id);
  const contact = (
    await (
      await admin.fetch(
        `/customers/${cb.id}/contacts`,
        json('POST', { name: 'Fictitious contact' }),
      )
    ).json()
  ).data;
  const list = await (
    await a.session.fetch(
      '/customers?exactName=Same%20fictitious%20name&pageSize=1',
    )
  ).json();
  expect(list.meta.total).toBe(1);
  expect(list.data.map((v: { id: string }) => v.id)).toEqual([ca.id]);
  expect(
    (await (await a.session.fetch(`/customers?ownerId=${b.user.id}`)).json())
      .meta.total,
  ).toBe(0);
  for (const path of [
    `/customers/${cb.id}`,
    `/customers/${cc.id}`,
    `/customers/${cb.id}/contacts`,
    `/customers/${cb.id}/contacts/${contact.id}`,
  ])
    expect((await a.session.fetch(path)).status).toBe(404);
  expect(
    (
      await a.session.fetch(
        `/customers/${cb.id}`,
        json('PATCH', { version: 1, notes: 'Forgery' }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await a.session.fetch(
        '/customers',
        json('POST', { companyName: 'Forgery', ownerId: b.user.id }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await a.session.fetch(
        `/customers/${ca.id}`,
        json('PATCH', { version: 1, ownerId: b.user.id }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await a.session.fetch(
        `/customers/${ca.id}/transferOwner`,
        json('POST', { version: 1, ownerId: b.user.id }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await a.session.fetch(
        `/customers/${cb.id}/contacts`,
        json('POST', { name: 'Forgery' }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await a.session.fetch(
        `/customers/${cb.id}/contacts/${contact.id}`,
        json('PATCH', { version: 1, name: 'Forgery' }),
      )
    ).status,
  ).toBe(404);
  const created = await a.session.fetch(
    '/customers',
    json('POST', { companyName: 'Own created customer' }),
  );
  expect(created.status).toBe(201);
  expect((await created.json()).data.ownerId).toBe(a.user.id);
  expect(
    (await (await a.session.fetch('/customerOwners')).json()).data,
  ).toEqual([{ id: a.user.id, name: a.user.name }]);
  const ml = await (await m.session.fetch('/customers')).json();
  expect(ml.meta.total).toBe(3);
  expect(
    (await m.session.fetch(`/customers/${cb.id}/contacts/${contact.id}`))
      .status,
  ).toBe(200);
  expect((await m.session.fetch(`/customers/${cc.id}`)).status).toBe(404);
  expect(
    (
      await m.session.fetch(
        `/customers/${cb.id}/transferOwner`,
        json('POST', { version: 1, ownerId: c.user.id }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await m.session.fetch(
        `/customers/${cb.id}/transferOwner`,
        json('POST', { version: 1, ownerId: a.user.id }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await m.session.fetch(
        `/customers/${cb.id}/transferOwner`,
        json('POST', { version: 1, ownerId: b.user.id }),
      )
    ).status,
  ).toBe(409);
  expect(
    (await a.session.fetch(`/customers/${cb.id}/contacts/${contact.id}`))
      .status,
  ).toBe(200);
  expect(
    (await b.session.fetch(`/customers/${cb.id}/contacts/${contact.id}`))
      .status,
  ).toBe(404);
  expect(
    (await db.repository('contacts').findOne({ filter: { id: contact.id } }))
      ?.name,
  ).toBe('Fictitious contact');
  expect(
    (await db.repository('customers').findOne({ filter: { id: cc.id } }))
      ?.ownerId,
  ).toBe(c.user.id);

  // Manager scope requires both the action grant and a live manager membership.
  const missing = await actor('manager-without-team', 'crm.salesManager');
  expect(
    (await (await missing.session.fetch('/customers')).json()).meta.total,
  ).toBe(0);
  expect(
    (
      await m.session.fetch(
        '/customers',
        json('POST', { companyName: 'Team create', ownerId: b.user.id }),
      )
    ).status,
  ).toBe(201);
  const before = await (
    await admin.fetch(`/crmTeamMembers/${a.user.id}`)
  ).json();
  expect(before.data.affectedCustomers).toBe(3);
  const unconfirmed = await admin.fetch(
    `/crmTeamMembers/${a.user.id}`,
    json('PUT', {
      teamId: t2.id,
      active: true,
      isManager: false,
      version: am.version,
    }),
  );
  expect(unconfirmed.status).toBe(400);
  expect(
    (
      await db
        .repository('crmTeamMembers')
        .findOne({ filter: { userId: a.user.id } })
    )?.teamId,
  ).toBe(t1.id);
  await join(a.user.id, t2.id, false, am.version, true);
  expect((await m.session.fetch(`/customers/${ca.id}`)).status).toBe(404);
  expect((await n.session.fetch(`/customers/${ca.id}`)).status).toBe(200);
  expect((await a.session.fetch(`/customers/${ca.id}`)).status).toBe(200);
  expect(
    (
      await admin.fetch(
        `/crmTeamMembers/${a.user.id}`,
        json('PUT', {
          teamId: t1.id,
          active: true,
          isManager: false,
          version: am.version,
          confirmImpact: true,
        }),
      )
    ).status,
  ).toBe(409);
  const auditCount = await db.repository('crmTeamChanges').count();
  expect(auditCount).toBe(8); // Two teams, five memberships, one successful transfer of membership.
  expect(
    (
      await admin.fetch(
        `/crmTeams/${t2.id}`,
        json('PATCH', { name: t2.name, active: false, version: t2.version }),
      )
    ).status,
  ).toBe(200);
  expect((await (await n.session.fetch('/customers')).json()).meta.total).toBe(
    0,
  );
  expect((await a.session.fetch(`/customers/${ca.id}`)).status).toBe(200);
  await users.disable(b.user.id);
  expect((await (await m.session.fetch('/customers')).json()).meta.total).toBe(
    0,
  );
  expect((await b.session.fetch('/customers')).status).toBe(401);
  await authz.permissionSets.revoke(a.assignment.id);
  expect((await a.session.fetch('/customers')).status).toBe(403);
  expect((await admin.fetch('/customers')).status).toBe(200);
  expect(
    (
      await admin.fetch(
        `/crmTeamMembers/${m.user.id}`,
        json('PUT', {
          teamId: t1.id,
          active: false,
          isManager: true,
          version: mm.version,
        }),
      )
    ).status,
  ).toBe(200);
  expect((await (await m.session.fetch('/customers')).json()).meta.total).toBe(
    0,
  );
});

test('keeps page grants separate from API actions and preserves remaining assignment sources', async ({
  testApp,
}) => {
  const authz = testApp.application.container.resolve(authorizationToken);
  const users = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const user = await users.create({
    name: 'Scope test',
    email: 'scope@example.test',
    password: 'Test-only-passphrase-123',
  });
  const session = await signIn(testApp, {
    email: user.email,
    password: 'Test-only-passphrase-123',
  });
  await authz.permissionSets.create({
    key: 'crm.pageOnly',
    grants: [
      {
        resource: { type: 'page', id: 'customers' },
        actions: [{ action: 'access' }],
      },
    ],
  });
  const page = await authz.permissionSets.assign({
    permissionSet: 'crm.pageOnly',
    subject: { type: 'user', id: user.id },
  });
  expect((await session.fetch('/customers')).status).toBe(403);
  await authz.permissionSets.create({
    key: 'crm.actionOnly',
    grants: [
      customersResource
        .reference()
        .grant({ view: { customers: 'recordsIOwn' } }),
    ],
  });
  const action = await authz.permissionSets.assign({
    permissionSet: 'crm.actionOnly',
    subject: { type: 'user', id: user.id },
  });
  await authz.permissionSets.revoke(page.id);
  const context = authz.for({ principal: { type: 'user', id: user.id } });
  expect(
    await context.can({
      resource: { type: 'page', id: 'customers' },
      action: 'access',
    }),
  ).toBe(false);
  expect((await session.fetch('/customers')).status).toBe(200);
  const sales = await authz.permissionSets.assign({
    permissionSet: 'crm.sales',
    subject: { type: 'user', id: user.id },
  });
  await authz.permissionSets.revoke(sales.id);
  expect((await session.fetch('/customers')).status).toBe(200);
  await authz.permissionSets.revoke(action.id);
  expect((await session.fetch('/customers')).status).toBe(403);
});
